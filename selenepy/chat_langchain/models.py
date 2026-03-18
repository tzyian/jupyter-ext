from enum import StrEnum
from typing import Annotated, TypedDict

from langgraph.graph.message import AnyMessage, add_messages


class Phase(StrEnum):
    INIT = "init"
    RESEARCH = "research"
    EDIT = "edit"
    DONE = "done"
    FAILED = "failed"


class AgentName(StrEnum):
    SUPERVISOR = "supervisor"
    RESEARCH = "research_agent"
    EDITOR = "notebook_editor_agent"


class EditStatus(StrEnum):
    NOT_STARTED = "not_started"
    SUCCESS = "success"
    RETRYABLE_FAILURE = "retryable_failure"
    NEEDS_RESEARCH = "needs_research"
    FATAL_FAILURE = "fatal_failure"


class Progress(StrEnum):
    INITIALIZED = "initialized"
    WORKFLOW_COMPLETE = "workflow_complete"
    INITIAL_RESEARCH_REQUIRED = "initial_research_required"
    EDITOR_WORK_PENDING = "editor_work_pending"
    EDITOR_REQUESTED_SPECIFIC_RESEARCH = "editor_requested_specific_research"
    EDITOR_RETRY_BUDGET_EXHAUSTED = "editor_retry_budget_exhausted"
    ALL_REQUIRED_WORK_COMPLETED = "all_required_work_completed"
    RESEARCH_COMPLETE = "research_complete"
    RESEARCH_FAILED_PROCEEDING = "research_failed_proceeding"
    NOTEBOOK_UPDATE_COMPLETE = "notebook_update_complete"
    EDITOR_REQUIRES_SPECIFIC_RESEARCH = "editor_requires_specific_research"
    EDITOR_RETRY_SCHEDULED = "editor_retry_scheduled"
    EDITOR_FAILED = "editor_failed"


class ErrorType(StrEnum):
    NONE = ""
    TOOL_ERROR = "tool_error"
    UNEXPECTED_ERROR = "unexpected_error"
    TRANSIENT_TOOL_ERROR = "transient_tool_error"
    MISSING_CONTEXT_REQUIRES_RESEARCH = "missing_context_requires_research"
    FATAL_EDITOR_ERROR = "fatal_editor_error"


class NextStep(StrEnum):
    RESEARCH = "research_agent"
    EDITOR = "notebook_editor_agent"
    END = "END"


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    user_request: str
    research_notes: str
    notebook_path: str
    phase: Phase
    last_agent: AgentName | str
    last_action: str
    route_reason: Progress | str
    progress: Progress | str
    edit_status: EditStatus
    retry_count_by_agent: dict[str, int]
    research_rounds: int
    editor_attempts: int
    max_editor_attempts: int
    needs_edit: bool
    needs_research_refresh: bool
    research_done: bool
    editor_done: bool
    editor_failed: bool
    last_error_type: ErrorType | str
    last_error_message: str
    retryable: bool
    handoff_count: int
    next: NextStep | str
    timeout: bool
    max_turns: bool
    done: bool


class ChatTurnResult(TypedDict):
    assistant_message: str
    research_notes: str
    notebook_path: str
    phase: Phase | str
    progress: Progress | str
    edit_status: EditStatus | str
    retry_count_by_agent: dict[str, int]
    research_rounds: int
    editor_attempts: int
    needs_edit: bool
    needs_research_refresh: bool
    research_done: bool
    editor_done: bool
    editor_failed: bool
    last_agent: AgentName | str
    last_action: str
    route_reason: Progress | str
    last_error_type: ErrorType | str
    last_error_message: str
    done: bool
