import json
import logging
import os
from typing import Annotated, Any, Mapping, TypedDict

from jupyter_server.base.handlers import APIHandler
from langchain_core.messages import (AIMessage, BaseMessage, HumanMessage,
                                     SystemMessage)
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .utils import format_snapshot_for_prompt

LOGGER = logging.getLogger(__name__)

OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY"
OPENAI_MODEL_ENV_VAR = "OPENAI_MODEL"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"


def _normalize_api_key(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip()
    return str(value).strip()


def _resolve_openai_api_key(preferred_key: str | None = None) -> str:
    key = _normalize_api_key(preferred_key)
    if key:
        return key
    return _normalize_api_key(os.getenv(OPENAI_API_KEY_ENV_VAR, ""))


def _resolve_model_name() -> str:
    model_name = str(os.getenv(OPENAI_MODEL_ENV_VAR, DEFAULT_OPENAI_MODEL)).strip()
    return model_name or DEFAULT_OPENAI_MODEL


class ChatStreamWriter:
    """Writes Server-Sent Events to the client for chat streaming."""

    def __init__(self, handler: APIHandler) -> None:
        self._handler = handler
        self._closed = False

    @property
    def is_closed(self) -> bool:
        return self._closed

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


async def call_model(state: AgentState, config: Mapping[str, Any] | None = None):
    """Model node that executes chat completions with OpenAI."""
    messages = state.get("messages", [])

    configurable = config.get("configurable") if config else None
    preferred_key = (
        configurable.get("openai_api_key")
        if isinstance(configurable, Mapping)
        else None
    )
    api_key = _resolve_openai_api_key(preferred_key)
    model_name = _resolve_model_name()

    if api_key:
        model = ChatOpenAI(model=model_name, streaming=True, api_key=api_key)
    else:
        model = ChatOpenAI(model=model_name, streaming=True)
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


def _build_history_messages(history: list[dict]) -> list[BaseMessage]:
    """Convert stored chat history dicts to LangChain message objects."""
    result: list[BaseMessage] = []
    for item in history:
        role = item.get("role", "user")
        content = item.get("content", "")
        if role == "user":
            result.append(HumanMessage(content=content))
        else:
            result.append(AIMessage(content=content))
    return result


async def stream_chat_response(
    message: str,
    writer: ChatStreamWriter,
    snapshot: Mapping[str, Any] | None = None,
    openai_api_key: str | None = None,
    history: list[dict[str, Any]] | None = None,
) -> str:
    """Run the LangGraph agent and stream output to the client.

    Returns the full AI response text so callers can persist it.
    """
    full_response = ""
    try:
        await writer.send_status("started")

        history_msgs = _build_history_messages(history or [])

        if snapshot:
            LOGGER.info(
                "Chat received snapshot context for path: %s",
                snapshot.get("path", "unknown"),
            )
            formatted_context = format_snapshot_for_prompt(snapshot)
            context_msg = SystemMessage(
                content=(
                    "You are a helpful coding assistant. Use the following notebook"
                    " context to answer any questions or craft code modifications.\n\n"
                    f"Notebook context:\n{formatted_context}"
                )
            )
            inputs = {
                "messages": [context_msg]
                + history_msgs
                + [HumanMessage(content=message)]
            }
        else:
            inputs = {"messages": history_msgs + [HumanMessage(content=message)]}

        resolved_api_key = _resolve_openai_api_key(openai_api_key)
        config = (
            {"configurable": {"openai_api_key": resolved_api_key}}
            if resolved_api_key
            else {}
        )

        async for event in graph.astream_events(inputs, config=config, version="v1"):
            if writer.is_closed:
                LOGGER.info("Chat stream closed by client; stopping generation loop")
                break

            kind = event["event"]
            if kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if content:
                    full_response += content
                    await writer.send_chunk(content)
                    if writer.is_closed:
                        LOGGER.info(
                            "Client disconnected during chunk streaming; stopping generation loop"
                        )
                        break

    except Exception as e:
        LOGGER.error("Error running LangGraph", exc_info=e)
        await writer.send_error(str(e))
    finally:
        await writer.send_status("complete")
        await writer.close()

    return full_response
