"""LangGraph chat orchestration."""

import asyncio
import json
import logging
from typing import Annotated, Any, Mapping, TypedDict

from jupyter_server.base.handlers import APIHandler
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


LOGGER = logging.getLogger(__name__)


class ChatStreamWriter:
    """Writes Server-Sent Events to the client for chat streaming."""

    def __init__(self, handler: APIHandler) -> None:
        self._handler = handler
        self._closed = False

    async def send_status(self, phase: str) -> None:
        await self._send({"type": "status", "phase": phase})

    async def send_chunk(self, content: str) -> None:
        await self._send({"type": "chunk", "content": content})

    async def send_error(self, message: str) -> None:
        await self._send({"type": "error", "message": message})

    async def _send(self, payload: Mapping[str, Any]) -> None:
        if self._closed:
            return
        try:
            chunk = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            self._handler.write(chunk)
            await self._handler.flush()
        except Exception:
            self._closed = True

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._handler.finish()


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


async def call_model(state: AgentState, config: dict = None):
    """Real model node that chats with Claude."""
    messages = state.get("messages", [])

    api_key = None
    if config and "configurable" in config:
        api_key = config["configurable"].get("openai_api_key")

    if api_key:
        model = ChatOpenAI(model="gpt-4o-mini", streaming=True, api_key=api_key)
    else:
        model = ChatOpenAI(model="gpt-4o-mini", streaming=True)
    response = await model.ainvoke(messages)

    return {"messages": [response]}


def create_chat_graph():
    """Create and compile the LangGraph workflow."""

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", call_model)
    workflow.set_entry_point("agent")
    workflow.add_edge("agent", END)
    return workflow.compile()


graph = create_chat_graph()


async def stream_chat_response(
    message: str, writer: ChatStreamWriter, snapshot: dict = None, openai_api_key: str = None
):
    """Run graph and stream output."""
    try:
        await writer.send_status("started")

        if snapshot:
            LOGGER.info(
                f"Chat received snapshot context for path: {snapshot.get('path', 'unknown')}"
            )


        inputs = {"messages": [HumanMessage(content=message)]}
        config = {"configurable": {"openai_api_key": openai_api_key}} if openai_api_key else {}

        # Stream using async events
        async for event in graph.astream_events(inputs, config=config, version="v1"):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                # Extract the token chunk from the model stream
                content = event["data"]["chunk"].content
                if content:
                    await writer.send_chunk(content)

    except Exception as e:
        LOGGER.error("Error running LangGraph", exc_info=e)
        await writer.send_error(str(e))
    finally:
        await writer.send_status("complete")
        await writer.close()
