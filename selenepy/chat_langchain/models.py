from enum import StrEnum
from typing import Annotated, TypedDict

from langgraph.graph.message import AnyMessage, add_messages


class Intent(StrEnum):
    REPLY = "reply"
    RESEARCH = "research"
    EDIT = "edit"
    CLARIFY = "clarify"
    RESEARCH_THEN_EDIT = "research_then_edit"


class AgentNode(StrEnum):
    ROUTER = "router_classifier"
    REPLY = "reply_agent"
    RESEARCH = "research_agent"
    EDITOR = "editor_agent"
    FINAL_RESPONDER = "final_responder"


class EditStatus(StrEnum):
    NOT_STARTED = "not_started"
    SUCCESS = "success"
    RETRYABLE_FAILURE = "retryable_failure"
    NEEDS_RESEARCH = "needs_research"
    FATAL_FAILURE = "fatal_failure"


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    user_request: str

    intent: Intent | str
    intent_confidence: float

    research_notes: str
    notebook_path: str
    edit_result: str

    edit_status: EditStatus
    retry_count_by_agent: dict[str, int]

    timeout: bool
    max_turns: bool
    done: bool
