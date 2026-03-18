import logging
import os
from pathlib import Path
from typing import Literal, Mapping

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import ToolException
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from .models import (
    AgentName,
    AgentState,
    EditStatus,
    ErrorType,
    NextStep,
    Phase,
    Progress,
)
from .prompts import NOTEBOOK_EDITOR_SYSTEM, RESEARCH_SYSTEM

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class EducatorNotebookWorkflow:
    def __init__(self, arxiv_tools, jupyter_tools, checkpointer=None):
        self.arxiv_tools = arxiv_tools
        self.jupyter_tools = jupyter_tools
        self.checkpointer = checkpointer or MemorySaver()

        self.use_notebook_mcp = self.find_tool(self.jupyter_tools, "use_notebook")
        self.model_name = (
            os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        )

    def _resolve_openai_api_key(
        self, config: RunnableConfig | None = None
    ) -> str | None:
        configurable = (
            config.get("configurable") if isinstance(config, Mapping) else None
        )
        preferred_key = ""
        if isinstance(configurable, Mapping):
            preferred_key = str(configurable.get("openai_api_key", "")).strip()
        if preferred_key:
            return preferred_key


        return None

    def _build_research_agent(self, config: RunnableConfig | None = None):
        api_key = self._resolve_openai_api_key(config)
        llm = ChatOpenAI(
            model=self.model_name,
            api_key=api_key,
            temperature=0.1,
        )
        return create_agent(
            llm,
            tools=self.arxiv_tools,
            system_prompt=RESEARCH_SYSTEM,
        )

    def _build_notebook_editor_agent(self, config: RunnableConfig | None = None):
        api_key = self._resolve_openai_api_key(config)
        llm = ChatOpenAI(
            model=self.model_name,
            api_key=api_key,
            temperature=0.1,
        )
        return create_agent(
            llm,
            tools=self.jupyter_tools,
            system_prompt=NOTEBOOK_EDITOR_SYSTEM,
        )

    @staticmethod
    def find_tool(tools, name: str):
        for t in tools:
            if t.name == name:
                return t
        raise ValueError(f"Tool not found: {name}")

    @staticmethod
    def _request_needs_research(user_request: str) -> bool:
        lower = (user_request or "").lower()
        research_markers = [
            "research",
            "arxiv",
            "citation",
            "paper",
            "survey",
            "literature",
            "state of the art",
            "benchmark",
            "evidence",
            "security",
            "rlhf",
        ]
        return any(marker in lower for marker in research_markers)

    @staticmethod
    def _increment_retry_count(
        retry_count_by_agent: dict[str, int], agent_name: str
    ) -> dict[str, int]:
        updated = dict(retry_count_by_agent or {})
        updated[agent_name] = updated.get(agent_name, 0) + 1
        return updated

    @staticmethod
    def _classify_editor_content(
        content: str,
    ) -> tuple[EditStatus, bool, bool, ErrorType]:
        lower = (content or "").lower()

        needs_research_markers = [
            "needs_research",
            "need more research",
            "missing citation",
            "insufficient research",
            "need additional sources",
        ]
        retryable_markers = [
            "retryable_failure",
            "temporary",
            "transient",
            "try again",
            "timeout",
        ]
        fatal_markers = [
            "fatal_failure",
            "cannot proceed",
            "hard failure",
            "unrecoverable",
        ]

        if any(marker in lower for marker in needs_research_markers):
            return (
                EditStatus.NEEDS_RESEARCH,
                False,
                True,
                ErrorType.MISSING_CONTEXT_REQUIRES_RESEARCH,
            )
        if any(marker in lower for marker in fatal_markers):
            return (
                EditStatus.FATAL_FAILURE,
                False,
                False,
                ErrorType.FATAL_EDITOR_ERROR,
            )
        if any(marker in lower for marker in retryable_markers):
            return (
                EditStatus.RETRYABLE_FAILURE,
                True,
                False,
                ErrorType.TRANSIENT_TOOL_ERROR,
            )
        return (EditStatus.SUCCESS, False, False, ErrorType.NONE)

    async def supervisor(self, state: AgentState, config: RunnableConfig) -> AgentState:
        logger.info("Supervisor received state")

        user_request = state.get("user_request", "")
        research_done = state.get("research_done", False)
        research_rounds = state.get("research_rounds", 0)
        editor_done = state.get("editor_done", False)
        editor_failed = state.get("editor_failed", False)
        editor_attempts = state.get("editor_attempts", 0)
        max_editor_attempts = state.get("max_editor_attempts", 2)
        needs_edit = state.get("needs_edit", True)
        needs_research_refresh = state.get("needs_research_refresh", False)
        request_needs_research = self._request_needs_research(user_request)

        decision = NextStep.END
        route_reason: Progress = Progress.WORKFLOW_COMPLETE
        done = False
        phase = state.get("phase", Phase.INIT)

        if not research_done and request_needs_research:
            decision = NextStep.RESEARCH
            route_reason = Progress.INITIAL_RESEARCH_REQUIRED
            phase = Phase.RESEARCH
        elif needs_research_refresh and research_rounds < 2:
            decision = NextStep.RESEARCH
            route_reason = Progress.EDITOR_REQUESTED_SPECIFIC_RESEARCH
            phase = Phase.RESEARCH
        elif (
            needs_edit
            and not editor_done
            and not editor_failed
            and editor_attempts < max_editor_attempts
        ):
            decision = NextStep.EDITOR
            route_reason = Progress.EDITOR_WORK_PENDING
            phase = Phase.EDIT
        else:
            done = True
            if editor_failed:
                route_reason = Progress.EDITOR_RETRY_BUDGET_EXHAUSTED
                phase = Phase.FAILED
            else:
                route_reason = Progress.ALL_REQUIRED_WORK_COMPLETED
                phase = Phase.DONE

        logger.info("Supervisor routed to: %s", decision)
        logger.info(
            "Supervisor state: research_done=%s research_rounds=%s needs_refresh=%s "
            "editor_done=%s editor_failed=%s editor_attempts=%s max_editor_attempts=%s needs_edit=%s",
            research_done,
            research_rounds,
            needs_research_refresh,
            editor_done,
            editor_failed,
            editor_attempts,
            max_editor_attempts,
            needs_edit,
        )

        return {
            "next": decision,
            "done": done,
            "phase": phase,
            "last_agent": AgentName.SUPERVISOR,
            "last_action": f"route:{decision}",
            "route_reason": route_reason,
            "progress": route_reason,
            "handoff_count": state.get("handoff_count", 0)
            + (0 if decision == NextStep.END else 1),
        }

    async def run_research_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        logger.info("Research agent received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), "research_agent"
        )
        research_rounds = state.get("research_rounds", 0) + 1

        try:
            research_agent = self._build_research_agent(config)
            result = await research_agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            content=(
                                f"User request: {state['user_request']}\n\n"
                                "Find relevant arXiv material and provide concise notes "
                                "useful for building an educational Jupyter notebook."
                            )
                        )
                    ]
                },
                config=config,
            )
            last_msg = result["messages"][-1]
            content = getattr(last_msg, "content", str(last_msg))
            progress = Progress.RESEARCH_COMPLETE
            last_error_type = ErrorType.NONE
            last_error_message = ""
            retryable = False
        except ToolException as exc:
            logger.warning("Research agent tool error: %s", exc)
            content = f"Research tool error: {exc}"
            progress = Progress.RESEARCH_FAILED_PROCEEDING
            last_error_type = ErrorType.TOOL_ERROR
            last_error_message = str(exc)
            retryable = True
        except Exception as exc:
            logger.exception("Research agent unexpected error")
            content = f"Research unexpected error: {exc}"
            progress = Progress.RESEARCH_FAILED_PROCEEDING
            last_error_type = ErrorType.UNEXPECTED_ERROR
            last_error_message = str(exc)
            retryable = False

        return {
            "research_notes": content,
            "messages": [AIMessage(content=f"Research findings:\n{content}")],
            "next": "supervisor",
            "phase": Phase.EDIT,
            "last_agent": AgentName.RESEARCH,
            "last_action": "research_completed",
            "route_reason": "handoff_to_supervisor",
            "progress": progress,
            "research_rounds": research_rounds,
            "research_done": True,
            "needs_research_refresh": False,
            "retry_count_by_agent": retry_count_by_agent,
            "last_error_type": last_error_type,
            "last_error_message": last_error_message,
            "retryable": retryable,
            "done": False,
        }

    async def run_notebook_editor_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        logger.info("Notebook editor agent received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), "notebook_editor_agent"
        )
        editor_attempts = state.get("editor_attempts", 0) + 1
        max_editor_attempts = state.get("max_editor_attempts", 2)

        notebook_path = state.get("notebook_path", "generated/selene_notebook.ipynb")
        Path(notebook_path).parent.mkdir(parents=True, exist_ok=True)

        notebook_name = os.path.basename(notebook_path)
        logger.info(
            "[notebook_editor] notebook_path=%r  notebook_name=%r",
            notebook_path,
            notebook_name,
        )

        try:
            notebook_editor_agent = self._build_notebook_editor_agent(config)
            result = await notebook_editor_agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            content=(
                                f"User request: {state['user_request']}\n\n"
                                f"Research notes:\n{state.get('research_notes', '')}\n\n"
                                f"Notebook path: {notebook_path}\n"
                                f"Notebook name: {notebook_name}\n\n"
                                f"Editor attempt: {editor_attempts}/{max_editor_attempts}\n"
                                "Create or update the notebook accordingly. "
                                "Use the notebook-selection MCP tool before notebook edits."
                            )
                        )
                    ]
                },
                config=config,
            )
            last_msg = result["messages"][-1]
            content = getattr(last_msg, "content", str(last_msg))
            edit_status, retryable, needs_research_refresh, last_error_type = (
                self._classify_editor_content(content)
            )
            last_error_message = ""
        except ToolException as exc:
            logger.warning("Notebook editor tool error: %s", exc)
            content = f"Notebook tool error: {exc}"
            edit_status = EditStatus.RETRYABLE_FAILURE
            retryable = True
            needs_research_refresh = False
            last_error_type = ErrorType.TRANSIENT_TOOL_ERROR
            last_error_message = str(exc)
        except Exception as exc:
            logger.exception("Notebook editor unexpected error")
            content = f"Notebook unexpected error: {exc}"
            edit_status = EditStatus.FATAL_FAILURE
            retryable = False
            needs_research_refresh = False
            last_error_type = ErrorType.FATAL_EDITOR_ERROR
            last_error_message = str(exc)

        retry_budget_exhausted = editor_attempts >= max_editor_attempts
        editor_done = edit_status == EditStatus.SUCCESS
        editor_failed = (edit_status == EditStatus.FATAL_FAILURE) or (
            edit_status == EditStatus.RETRYABLE_FAILURE and retry_budget_exhausted
        )

        if edit_status == EditStatus.NEEDS_RESEARCH:
            progress = Progress.EDITOR_REQUIRES_SPECIFIC_RESEARCH
        elif editor_done:
            progress = Progress.NOTEBOOK_UPDATE_COMPLETE
        elif editor_failed:
            progress = Progress.EDITOR_FAILED
        else:
            progress = Progress.EDITOR_RETRY_SCHEDULED

        return {
            "messages": [AIMessage(content=f"Notebook editor result:\n{content}")],
            "next": "supervisor",
            "phase": Phase.EDIT,
            "last_agent": AgentName.EDITOR,
            "last_action": f"editor:{edit_status}",
            "route_reason": "handoff_to_supervisor",
            "progress": progress,
            "edit_status": edit_status,
            "editor_attempts": editor_attempts,
            "editor_done": editor_done,
            "editor_failed": editor_failed,
            "needs_edit": not editor_done,
            "needs_research_refresh": needs_research_refresh,
            "retry_count_by_agent": retry_count_by_agent,
            "last_error_type": last_error_type,
            "last_error_message": last_error_message,
            "retryable": retryable,
            "done": False,
        }

    @staticmethod
    def route_from_supervisor(
        state: AgentState,
    ) -> Literal["research_agent", "notebook_editor_agent", "__end__"]:
        if state.get("done"):
            return END

        nxt = state.get("next", "END")
        if nxt == "research_agent":
            return "research_agent"
        if nxt == "notebook_editor_agent":
            return "notebook_editor_agent"
        return END

    def build_graph(self):
        builder = StateGraph(AgentState)

        builder.add_node("supervisor", self.supervisor)
        builder.add_node("research_agent", self.run_research_agent)
        builder.add_node("notebook_editor_agent", self.run_notebook_editor_agent)

        builder.add_edge(START, "supervisor")

        builder.add_conditional_edges(
            "supervisor",
            self.route_from_supervisor,
            {
                "research_agent": "research_agent",
                "notebook_editor_agent": "notebook_editor_agent",
                END: END,
            },
        )

        builder.add_edge("research_agent", "supervisor")
        builder.add_edge("notebook_editor_agent", "supervisor")

        # builder.add_edge("supervisor", "notebook_editor_agent")
        # builder.add_edge("notebook_editor_agent", END)

        return builder.compile(checkpointer=self.checkpointer)
