import asyncio
import importlib
import inspect
import sqlite3
import time
from datetime import datetime
from typing import Any, AsyncGenerator, cast

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import AnyMessage

from ..logging import get_logger
from ..paths import get_langgraph_checkpoint_path
from .models import AgentState, EditStatus, Intent
from .servers import servers
from .telemetry import callbacks_config
from .workflow import EducatorNotebookWorkflow

LOGGER = get_logger(__name__)


def _load_checkpointer_classes() -> tuple[type[Any] | None, type[Any] | None]:
    """Return AsyncSqliteSaver and SqliteSaver classes when available."""
    async_cls = None
    sync_cls = None

    try:
        module = importlib.import_module("langgraph.checkpoint.sqlite.aio")
        async_cls = getattr(module, "AsyncSqliteSaver", None)
    except Exception:
        async_cls = None

    try:
        module = importlib.import_module("langgraph.checkpoint.sqlite")
        sync_cls = getattr(module, "SqliteSaver", None)
    except Exception:
        sync_cls = None

    return async_cls, sync_cls


def _to_checkpoint_message_dict(
    message: Any, thread_id: str, index: int
) -> dict[str, Any]:
    """Convert checkpoint message objects into frontend chat response shape."""
    role = "ai"
    content = ""
    message_id = None
    timestamp = None
    thoughts = None
    tool_calls = None

    def _normalize_tool_calls(raw_calls: Any) -> list[dict[str, Any]] | None:
        if not isinstance(raw_calls, list):
            return None
        normalized: list[dict[str, Any]] = []
        for item in raw_calls:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("tool_name") or item.get("id")
            input_value = item.get("input")
            if input_value is None:
                input_value = item.get("args")
            if input_value is None:
                input_value = item.get("arguments", "")
            status = str(item.get("status", "done")).lower()
            normalized.append(
                {
                    "name": str(name or "unknown"),
                    "input": input_value if input_value is not None else "",
                    "status": "active" if status == "active" else "done",
                }
            )
        return normalized or None

    def _normalize_timestamp(value: Any) -> float | None:
        if value is None:
            return None
        try:
            raw = float(value)
        except (TypeError, ValueError):
            return None

        # Milliseconds epoch values are far larger than seconds.
        if raw >= 1_000_000_000_000:
            raw = raw / 1000.0

        # Guard against implausible values that are likely parse artifacts.
        if raw <= 0:
            return None
        return raw

    if isinstance(message, BaseMessage):
        message_type = str(getattr(message, "type", "")).lower()
        if message_type == "human":
            role = "user"
        elif message_type in {"ai", "assistant"}:
            role = "ai"
        else:
            role = "ai"
        raw_content = getattr(message, "content", "")
        content = raw_content if isinstance(raw_content, str) else str(raw_content)
        message_id = getattr(message, "id", None)

        # Extract intermediate data from additional_kwargs
        kwargs = getattr(message, "additional_kwargs", {})
        thoughts = kwargs.get("thoughts")
        tool_calls = _normalize_tool_calls(
            kwargs.get("tool_calls_trace")
            or kwargs.get("toolCalls")
            or kwargs.get("tool_calls")
        )
        timestamp = _normalize_timestamp(
            kwargs.get("timestamp")
            or kwargs.get("created_at")
            or kwargs.get("createdAt")
        )

        # Fallback for standard tool calls if trace is missing
        if not tool_calls and hasattr(message, "tool_calls"):
            raw_tc = getattr(message, "tool_calls", [])
            tool_calls = _normalize_tool_calls(raw_tc)

    elif isinstance(message, dict):
        raw_role = str(message.get("role", "ai")).lower()
        role = "user" if raw_role == "user" else "ai"
        content = str(message.get("content", ""))
        message_id = message.get("id")
        additional_kwargs = message.get("additional_kwargs")
        if not isinstance(additional_kwargs, dict):
            additional_kwargs = {}

        thoughts = message.get("thoughts") or additional_kwargs.get("thoughts")
        tool_calls = _normalize_tool_calls(
            message.get("toolCalls")
            or message.get("tool_calls")
            or additional_kwargs.get("tool_calls_trace")
            or additional_kwargs.get("toolCalls")
            or additional_kwargs.get("tool_calls")
        )
        timestamp = _normalize_timestamp(
            message.get("timestamp")
            or message.get("created_at")
            or message.get("createdAt")
            or additional_kwargs.get("timestamp")
            or additional_kwargs.get("created_at")
            or additional_kwargs.get("createdAt")
        )
    else:
        content = str(message)

    normalized_id = str(message_id).strip() if message_id else f"cp-{thread_id}-{index}"

    # Try to extract timestamp from message ID (frontend creates IDs as Date.now())
    if timestamp is None and message_id:
        try:
            timestamp_ms = int(str(message_id).strip())
            if (
                1000000000000 < timestamp_ms < 10000000000000
            ):  # Reasonable timestamp range in ms
                timestamp = timestamp_ms / 1000  # Convert to seconds
        except (ValueError, TypeError):
            timestamp = None

    result = {
        "id": normalized_id,
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "timestamp": timestamp,
    }
    if thoughts:
        result["thoughts"] = thoughts
    if tool_calls:
        result["toolCalls"] = tool_calls
    return result


class EducatorNotebookService:
    def __init__(self, checkpointer=None):
        self.checkpointer = checkpointer
        self._checkpointer_connection: sqlite3.Connection | None = None
        self._checkpointer_async_context_manager = None
        self._use_thread_checkpoint = checkpointer is not None
        self.client: MultiServerMCPClient | None = None
        self.workflow: EducatorNotebookWorkflow | None = None
        self.app: Any = None
        self._arxiv_session_ctx = None
        self._jupyter_session_ctx = None

    async def _ensure_checkpointer(self) -> None:
        if self.checkpointer is not None:
            return

        sqlite_db_path = get_langgraph_checkpoint_path()
        async_cls, sync_cls = _load_checkpointer_classes()

        if async_cls is not None:
            try:
                context_manager = async_cls.from_conn_string(str(sqlite_db_path))
                self.checkpointer = await context_manager.__aenter__()
                self._checkpointer_async_context_manager = context_manager
                self._use_thread_checkpoint = True
                LOGGER.info(
                    "[chat_langchain] Using async sqlite checkpointer at %s",
                    sqlite_db_path,
                )
                return
            except Exception as error:  # pylint: disable=broad-except
                LOGGER.warning(
                    "[chat_langchain] Async sqlite checkpointer unavailable, trying sync saver: %s",
                    error,
                )

        if sync_cls is not None:
            try:
                connection = sqlite3.connect(
                    str(sqlite_db_path), check_same_thread=False
                )
                self._checkpointer_connection = connection
                self.checkpointer = sync_cls(connection)
                self._use_thread_checkpoint = True
                LOGGER.info(
                    "[chat_langchain] Using sqlite checkpointer at %s", sqlite_db_path
                )
                return
            except Exception as error:  # pylint: disable=broad-except
                LOGGER.warning(
                    "[chat_langchain] Failed to initialize sqlite checkpointer, falling back to MemorySaver: %s",
                    error,
                )

        self.checkpointer = MemorySaver()
        self._use_thread_checkpoint = False
        LOGGER.info("[chat_langchain] Using in-memory checkpointer fallback")

    async def initialize(self):
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
        history: list[dict[str, Any]] | None = None,
        max_minutes: int = 5,
        system_prompt: str = "",
    ) -> AsyncGenerator[dict[str, Any], None]:
        history_messages = self._build_history_messages(history or [])

        messages = [
            HumanMessage(
                content=user_message,
            )
        ]
        if not self._use_thread_checkpoint:
            messages = history_messages + messages

        state: AgentState = {
            "messages": cast(list[AnyMessage], messages),
            "user_request": user_message,
            "intent": Intent.REPLY,
            "intent_confidence": 0.0,
            "research_notes": "",
            "all_thoughts": [],
            "all_tool_calls": [],
            "notebook_context": notebook_context,
            "active_cell_index": active_cell_index,
            "edit_result": "",
            "edit_status": EditStatus.NOT_STARTED,
            "retry_count_by_agent": {},
            "done": False,
        }

        configurable: dict[str, Any] = {
            "openai_api_key": openai_api_key or "",
            "chat_system_prompt": system_prompt,
            "notebook_context": notebook_context,
        }
        if self._use_thread_checkpoint:
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
                    yield {"type": "error", "message": "chat_langchain timed out"}
                    break

                kind = event.get("event")

                if kind == "on_chat_model_stream":
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
                    if node_name == "responder_agent":
                        yield {"type": "chunk", "content": chunk_content}
                    else:
                        tags = event.get("tags", [])
                        agent_name = "Agent"
                        for t in tags:
                            if t.startswith("agent:"):
                                agent_name = t.split(":", 1)[1]

                        if agent_name in ("Research", "Editor"):
                            yield {
                                "type": "intermediate_chunk",
                                "agent": agent_name,
                                "content": chunk_content,
                            }

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", "")
                    yield {"type": "tool_call", "name": tool_name, "input": tool_input}

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    yield {"type": "tool_result", "name": tool_name, "status": "done"}

        except asyncio.CancelledError:
            raise
        except Exception as error:
            LOGGER.error("Error during astream_events", exc_info=error)
            yield {"type": "error", "message": str(error)}

    @staticmethod
    def _build_history_messages(history: list[dict[str, Any]]):
        """Convert chat_db role/content rows into LangChain messages."""
        result = []
        for item in history:
            role = str(item.get("role", "")).strip().lower()
            content = str(item.get("content", ""))
            if role == "user":
                result.append(HumanMessage(content=content))
            elif role in {"ai", "assistant"}:
                result.append(AIMessage(content=content))
        return result

    async def get_thread_messages(self, thread_id: str) -> list[dict[str, Any]]:
        """Read persisted messages for a thread directly from the checkpointer."""
        if self.app is None:
            raise RuntimeError(
                "Service not initialized. Call initialize() before get_thread_messages()."
            )

        if not thread_id.strip() or not self._use_thread_checkpoint:
            return []

        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        get_state = getattr(self.app, "aget_state", None)
        if get_state is None:
            get_state = getattr(self.app, "get_state", None)
        if get_state is None:
            return []

        snapshot = get_state(config)
        if inspect.isawaitable(snapshot):
            snapshot = await snapshot

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

        get_state_history = getattr(self.app, "aget_state_history", None)
        if get_state_history is None:
            get_state_history = getattr(self.app, "get_state_history", None)
        if get_state_history is None:
            return formatted

        snapshots = get_state_history(config)
        if inspect.isawaitable(snapshots):
            snapshots = await snapshots

        # Support both synchronous iterables and asynchronous iterables returned
        # by different LangGraph versions/checkpointers.
        ordered_snapshots: list[Any] = []
        if hasattr(snapshots, "__aiter__"):
            async for item in snapshots:
                ordered_snapshots.append(item)
        else:
            try:
                ordered_snapshots = list(snapshots)
            except TypeError:
                return formatted

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

        if self._checkpointer_connection is not None:
            self._checkpointer_connection.close()
            self._checkpointer_connection = None

        if self._jupyter_session_ctx:
            await self._jupyter_session_ctx.__aexit__(None, None, None)
        if self._arxiv_session_ctx:
            await self._arxiv_session_ctx.__aexit__(None, None, None)


