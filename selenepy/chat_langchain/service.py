import importlib
import inspect
import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, cast

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import AnyMessage

from .models import AgentState, EditStatus, ErrorType, Phase, Progress
from .servers import servers
from .telemetry import callbacks_config
from .workflow import EducatorNotebookWorkflow

LOGGER = logging.getLogger(__name__)


def _load_checkpointer_classes() -> tuple[type[Any] | None, type[Any] | None]:
    """Return AsyncSqliteSaver and SqliteSaver classes when available."""
    async_cls = None
    sync_cls = None

    try:
        module = importlib.import_module("langgraph.checkpoint.sqlite.aio")
        async_cls = getattr(module, "AsyncSqliteSaver", None)
    except Exception:  # pylint: disable=broad-except
        async_cls = None

    try:
        module = importlib.import_module("langgraph.checkpoint.sqlite")
        sync_cls = getattr(module, "SqliteSaver", None)
    except Exception:  # pylint: disable=broad-except
        sync_cls = None

    return async_cls, sync_cls


def _to_checkpoint_message_dict(
    message: Any, thread_id: str, index: int
) -> dict[str, Any]:
    """Convert checkpoint message objects into frontend chat response shape."""
    role = "ai"
    content = ""
    message_id = None

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
    elif isinstance(message, dict):
        raw_role = str(message.get("role", "ai")).lower()
        role = "user" if raw_role == "user" else "ai"
        content = str(message.get("content", ""))
        message_id = message.get("id")
    else:
        content = str(message)

    normalized_id = str(message_id).strip() if message_id else f"cp-{thread_id}-{index}"
    return {
        "id": normalized_id,
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "timestamp": None,
    }


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

        sqlite_db_path = Path.cwd() / ".langgraph_checkpoints.sqlite"
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

        self.workflow = EducatorNotebookWorkflow(
            arxiv_tools=arxiv_tools,
            jupyter_tools=jupyter_tools,
            checkpointer=self.checkpointer,
        )
        self.app = self.workflow.build_graph()

    async def chat_turn(
        self,
        session_id: str,
        user_message: str,
        openai_api_key: str | None = None,
        notebook_path: str = "",
        history: list[dict[str, Any]] | None = None,
        max_minutes: int = 5,
        max_turns: int = 3,
    ):
        import asyncio
        import time

        history_messages = self._build_history_messages(history or [])

        # If checkpoint resume is active, pass only the new user message to avoid
        # duplicating prior turns that are already stored in LangGraph state.
        messages = [HumanMessage(content=user_message)]
        if not self._use_thread_checkpoint:
            messages = history_messages + messages

        state: AgentState = {
            "messages": cast(list[AnyMessage], messages),
            "user_request": user_message,
            "research_notes": "",
            "notebook_path": notebook_path,
            "phase": Phase.INIT,
            "last_agent": "",
            "last_action": "",
            "route_reason": "",
            "progress": Progress.INITIALIZED,
            "edit_status": EditStatus.NOT_STARTED,
            "retry_count_by_agent": {},
            "research_rounds": 0,
            "editor_attempts": 0,
            "max_editor_attempts": 2,
            "needs_edit": True,
            "needs_research_refresh": False,
            "research_done": False,
            "editor_done": False,
            "editor_failed": False,
            "last_error_type": ErrorType.NONE,
            "last_error_message": "",
            "retryable": False,
            "handoff_count": 0,
            "next": "",
            "timeout": False,
            "max_turns": False,
            "done": False,
        }

        configurable: dict[str, Any] = {
            "openai_api_key": openai_api_key or "",
        }
        if self._use_thread_checkpoint:
            configurable["thread_id"] = session_id

        config: RunnableConfig = {"configurable": configurable, **callbacks_config()}

        if self.app is None:
            raise RuntimeError(
                "Service not initialized. Call initialize() before chat_turn()."
            )

        start_time = time.monotonic()
        turns = 0
        result = state
        try:
            while not result.get("done", False):
                if (time.monotonic() - start_time) > max_minutes * 60:
                    result["done"] = True
                    result["timeout"] = True
                    break
                if turns >= max_turns:
                    result["done"] = True
                    result["max_turns"] = True
                    break
                result = await asyncio.wait_for(
                    self.app.ainvoke(result, config=config), timeout=max_minutes * 60
                )
                turns += 1
        except asyncio.TimeoutError:
            result["done"] = True
            result["timeout"] = True

        messages = result.get("messages") or []
        assistant_message = ""
        if messages:
            assistant_message = getattr(messages[-1], "content", str(messages[-1]))

        return {
            "assistant_message": assistant_message,
            "research_notes": result.get("research_notes", ""),
            "notebook_path": result.get("notebook_path", notebook_path),
            "phase": str(result.get("phase", "")),
            "progress": str(result.get("progress", "")),
            "edit_status": str(result.get("edit_status", "")),
            "retry_count_by_agent": result.get("retry_count_by_agent", {}),
            "research_rounds": result.get("research_rounds", 0),
            "editor_attempts": result.get("editor_attempts", 0),
            "needs_edit": result.get("needs_edit", True),
            "needs_research_refresh": result.get("needs_research_refresh", False),
            "research_done": result.get("research_done", False),
            "editor_done": result.get("editor_done", False),
            "editor_failed": result.get("editor_failed", False),
            "last_agent": str(result.get("last_agent", "")),
            "last_action": result.get("last_action", ""),
            "route_reason": str(result.get("route_reason", "")),
            "last_error_type": str(result.get("last_error_type", "")),
            "last_error_message": result.get("last_error_message", ""),
            "done": result.get("done", False),
            "timeout": result.get("timeout", False),
            "max_turns": result.get("max_turns", False),
            "turns": turns,
        }

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


async def test_service():
    service = EducatorNotebookService()
    await service.initialize()

    try:
        notebook_path = "generated/test_dp.ipynb"
        notebook_path = ""

        # result1 = await service.chat_turn(
        #     session_id="notebook:generated/selene_generated_notebook.ipynb",
        #     user_message=(
        #         "Create a beginner-friendly notebook on dynamic programming "
        #         "with a knapsack example and short research grounding."
        #     ),
        #     notebook_path=notebook_path,
        # )
        print(
            "========================================================"
            "========================================================"
            "========================================================"
            "========================================================"
        )
        # print(json.dumps(result1, indent=2))

        result2 = await service.chat_turn(
            session_id="notebook:generated/generated_notebook.ipynb",
            user_message="What day is it today?",
            notebook_path=notebook_path,
        )
        print(json.dumps(result2, indent=2))
    finally:
        await service.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_service())
