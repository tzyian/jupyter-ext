from enum import StrEnum
from typing import Annotated, Any, TypedDict

from langgraph.graph.message import AnyMessage, add_messages


def add_data(left: list, right: list):
    """Reducer to accumulate data by concatenation."""
    if not left:
        return right
    if not right:
        return left
    return left + right


class Intent(StrEnum):
    REPLY = "reply"
    RESEARCH = "research"
    EDIT = "edit"
    CLARIFY = "clarify"
    RESEARCH_THEN_EDIT = "research_then_edit"


class AgentNode(StrEnum):
    ROUTER = "router_classifier"
    RESPONDER = "responder_agent"
    RESEARCH = "research_agent"
    EDITOR = "editor_agent"


class EditStatus(StrEnum):
    NOT_STARTED = "not_started"
    SUCCESS = "success"
    RETRYABLE_FAILURE = "retryable_failure"
    NEEDS_RESEARCH = "needs_research"
    FATAL_FAILURE = "fatal_failure"


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    all_thoughts: Annotated[list[dict[str, str]], add_data]
    all_tool_calls: Annotated[list[dict[str, Any]], add_data]
    user_request: str

    intent: Intent | str
    intent_confidence: float

    research_notes: str
    notebook_path: str
    notebook_context: str
    active_cell_index: int
    edit_result: str

    edit_status: EditStatus
    retry_count_by_agent: dict[str, int]

    done: bool
