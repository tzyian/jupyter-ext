import asyncio
import time
from datetime import datetime
from typing import Any, AsyncGenerator, cast

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph.message import AnyMessage
from openai import AsyncStream

from selenepy.chat_langchain.models import StreamEventKind, StreamPayloadType
from selenepy.chat_langchain.utils import _to_checkpoint_message_dict

from ..logging import get_logger
from ..paths import get_langgraph_checkpoint_path
from .models import AgentNode, AgentState, Intent
from .servers import servers
from .telemetry import callbacks_config
from .workflow import EducatorNotebookWorkflow

LOGGER = get_logger(__name__)


def _ensure_openai_asyncstream_compat() -> None:
    """Provide AsyncStream.aclose() compatibility for OpenAI SDK variants."""
    if hasattr(AsyncStream, "aclose"):
        return
    if not hasattr(AsyncStream, "close"):
        return

    async def _aclose(self: AsyncStream[Any]) -> None:
        await self.close()

    setattr(AsyncStream, "aclose", _aclose)


class EducatorNotebookService:
    def __init__(self, checkpointer=None):
        self.checkpointer = checkpointer
        self._checkpointer_async_context_manager = None
        self.client: MultiServerMCPClient | None = None
        self.workflow: EducatorNotebookWorkflow | None = None
        self.app: Any = None
        self._arxiv_session_ctx = None
        self._jupyter_session_ctx = None

    async def _ensure_checkpointer(self) -> None:
        if self.checkpointer is not None:
            return

        sqlite_db_path = get_langgraph_checkpoint_path()
        try:
            context_manager = AsyncSqliteSaver.from_conn_string(str(sqlite_db_path))
            self.checkpointer = await context_manager.__aenter__()
            self._checkpointer_async_context_manager = context_manager
            LOGGER.info(
                "[chat_langchain] Using async sqlite checkpointer at %s",
                sqlite_db_path,
            )
            return
        except Exception as error:
            LOGGER.warning(
                "[chat_langchain] Failed to initialize async sqlite checkpointer, falling back to MemorySaver: %s",
                error,
            )

        self.checkpointer = MemorySaver()
        LOGGER.info("[chat_langchain] Using in-memory checkpointer fallback")

    async def initialize(self):
        _ensure_openai_asyncstream_compat()

        await self._ensure_checkpointer()
        self.client = MultiServerMCPClient(servers)

        self._arxiv_session_ctx = self.client.session("arxiv")
        self._jupyter_session_ctx = self.client.session("jupyter")

        arxiv_session = await self._arxiv_session_ctx.__aenter__()
        jupyter_session = await self._jupyter_session_ctx.__aenter__()

        arxiv_tools = await load_mcp_tools(arxiv_session)
        jupyter_tools = await load_mcp_tools(jupyter_session)

        excluded_tools = [
            "insert_execute_code_cell",
            "execute_cell",
            "list_kernels",
        ]
        jupyter_tools = [t for t in jupyter_tools if t.name not in excluded_tools]

        self.workflow = EducatorNotebookWorkflow(
            arxiv_tools=arxiv_tools,
            jupyter_tools=jupyter_tools,
            checkpointer=self.checkpointer,
        )
        self.app = self.workflow.build_graph()

    async def chat_turn_stream(
        self,
        session_id: str,
        user_message: str,
        openai_api_key: str | None = None,
        notebook_path: str = "",
        notebook_context: str = "",
        active_cell_index: int = -1,
        max_minutes: int = 5,
        system_prompt: str = "",
    ) -> AsyncGenerator[dict[str, Any], None]:
        messages = [
            HumanMessage(
                content=user_message,
            )
        ]

        state: AgentState = {
            "messages": cast(list[AnyMessage], messages),
            "user_request": user_message,
            "intent": Intent.REPLY,
            "intent_confidence": 0.0,
            "research_notes": "",
            "all_thoughts": [],
            "all_tool_calls": [],
            "notebook_path": notebook_path,
            "notebook_context": notebook_context,
            "active_cell_index": active_cell_index,
            "edit_result": "",
            "done": False,
        }

        configurable: dict[str, Any] = {
            "openai_api_key": openai_api_key or "",
            "chat_system_prompt": system_prompt,
            "notebook_context": notebook_context,
        }
        if session_id.strip():
            configurable["thread_id"] = session_id

        config: RunnableConfig = {"configurable": configurable, **callbacks_config()}

        if self.app is None:
            raise RuntimeError(
                "Service not initialized. Call initialize() before chat_turn_stream()."
            )

        start_time = time.monotonic()
        try:
            async for event in self.app.astream_events(
                state, config=config, version="v2"
            ):
                if (time.monotonic() - start_time) > max_minutes * 60:
                    yield {
                        "type": StreamPayloadType.ERROR.value,
                        "message": "chat_langchain timed out",
                    }
                    break

                kind = event.get("event")

                if kind == StreamEventKind.ON_CHAT_MODEL_STREAM.value:
                    chunk_content = ""
                    chunk_data = event.get("data", {}).get("chunk")
                    if (
                        chunk_data
                        and hasattr(chunk_data, "content")
                        and isinstance(chunk_data.content, str)
                    ):
                        chunk_content = chunk_data.content

                    if not chunk_content:
                        continue

                    node_name = event.get("metadata", {}).get("langgraph_node")
                    if node_name == AgentNode.RESPONDER.value:
                        yield {
                            "type": StreamPayloadType.CHUNK.value,
                            "content": chunk_content,
                        }
                    else:
                        tags = event.get("tags", [])
                        agent_name = "Agent"
                        for t in tags:
                            if t.startswith("agent:"):
                                agent_name = t.split(":", 1)[1]

                        normalized_agent = agent_name.removesuffix(" Agent")
                        if normalized_agent in ("Research", "Editor"):
                            yield {
                                "type": StreamPayloadType.INTERMEDIATE_CHUNK.value,
                                "agent": normalized_agent,
                                "content": chunk_content,
                            }

                elif kind == StreamEventKind.ON_TOOL_START.value:
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", "")
                    yield {
                        "type": StreamPayloadType.TOOL_CALL.value,
                        "name": tool_name,
                        "input": tool_input,
                    }

                elif kind == StreamEventKind.ON_TOOL_END.value:
                    tool_name = event.get("name", "unknown")
                    yield {
                        "type": StreamPayloadType.TOOL_RESULT.value,
                        "name": tool_name,
                        "status": "done",
                    }

        except asyncio.CancelledError:
            raise
        except Exception as error:
            LOGGER.error("Error during astream_events", exc_info=error)
            yield {"type": StreamPayloadType.ERROR.value, "message": str(error)}

    async def get_thread_messages(self, thread_id: str) -> list[dict[str, Any]]:
        """Read persisted messages for a thread directly from the checkpointer."""
        if self.app is None:
            raise RuntimeError(
                "Service not initialized. Call initialize() before get_thread_messages()."
            )

        if not thread_id.strip():
            return []

        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        snapshot = await self.app.aget_state(config)

        values = getattr(snapshot, "values", {}) if snapshot is not None else {}
        if not isinstance(values, dict):
            return []

        raw_messages = values.get("messages", [])
        if not isinstance(raw_messages, list):
            return []

        formatted: list[dict[str, Any]] = []
        for index, message in enumerate(raw_messages):
            formatted.append(_to_checkpoint_message_dict(message, thread_id, index))

        # Backfill missing message timestamps from checkpoint timestamps.
        # LangGraph's StateSnapshot.created_at is per-checkpoint (not per message),
        # so we map each message to the first checkpoint where it appears.
        missing_ids = {
            str(item["id"]): item
            for item in formatted
            if item.get("timestamp") is None and item.get("id") is not None
        }
        if not missing_ids:
            return formatted

        def _to_epoch_seconds(created_at: Any) -> float | None:
            if isinstance(created_at, (int, float)):
                raw = float(created_at)
                return raw / 1000.0 if raw >= 1_000_000_000_000 else raw
            if not isinstance(created_at, str) or not created_at.strip():
                return None
            try:
                normalized = created_at.replace("Z", "+00:00")
                return datetime.fromisoformat(normalized).timestamp()
            except ValueError:
                return None

        snapshots = self.app.aget_state_history(config)

        ordered_snapshots: list[Any] = []
        async for item in snapshots:
            ordered_snapshots.append(item)

        for history_snapshot in reversed(ordered_snapshots):
            checkpoint_payload = getattr(history_snapshot, "checkpoint", None)
            checkpoint_ts = _to_epoch_seconds(
                getattr(history_snapshot, "created_at", None)
            )
            if checkpoint_ts is None:
                checkpoint_ts = _to_epoch_seconds(getattr(history_snapshot, "ts", None))
            if checkpoint_ts is None and isinstance(checkpoint_payload, dict):
                checkpoint_ts = _to_epoch_seconds(checkpoint_payload.get("ts"))
            if checkpoint_ts is None:
                continue

            history_values = getattr(history_snapshot, "values", {})
            if (
                not isinstance(history_values, dict) or not history_values
            ) and isinstance(checkpoint_payload, dict):
                history_values = checkpoint_payload.get("channel_values", {})
            if not isinstance(history_values, dict):
                continue

            history_messages = history_values.get("messages", [])
            if not isinstance(history_messages, list):
                continue

            for history_index, history_message in enumerate(history_messages):
                mapped = _to_checkpoint_message_dict(
                    history_message, thread_id, history_index
                )
                mapped_id = str(mapped.get("id", "")).strip()
                if not mapped_id:
                    continue
                target = missing_ids.get(mapped_id)
                if target is not None and target.get("timestamp") is None:
                    target["timestamp"] = checkpoint_ts

        return formatted

    async def close(self):
        if self._checkpointer_async_context_manager is not None:
            await self._checkpointer_async_context_manager.__aexit__(None, None, None)
            self._checkpointer_async_context_manager = None

        if self._jupyter_session_ctx:
            await self._jupyter_session_ctx.__aexit__(None, None, None)
        if self._arxiv_session_ctx:
            await self._arxiv_session_ctx.__aexit__(None, None, None)
