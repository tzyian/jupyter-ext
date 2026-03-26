from enum import StrEnum
from typing import Annotated, Any, TypedDict

from langgraph.graph.message import AnyMessage, add_messages
from pydantic import BaseModel, Field


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


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    all_thoughts: Annotated[list[dict[str, str]], add_data]
    all_tool_calls: Annotated[list[dict[str, Any]], add_data]
    user_request: str

    intent: Intent
    intent_confidence: float

    research_notes: str
    notebook_path: str
    notebook_context: str
    active_cell_index: int
    edit_result: str

    done: bool


class WorkflowEventKind(StrEnum):
    ON_CHAT_MODEL_STREAM = "on_chat_model_stream"
    ON_TOOL_START = "on_tool_start"
    ON_TOOL_END = "on_tool_end"
    ON_CHAIN_END = "on_chain_end"


class RouterClassification(BaseModel):
    intent: Intent
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Router confidence score between 0.0 and 1.0.",
    )


class StreamPayloadType(StrEnum):
    CHUNK = "chunk"
    INTERMEDIATE_CHUNK = "intermediate_chunk"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"


class StreamEventKind(StrEnum):
    ON_CHAT_MODEL_STREAM = "on_chat_model_stream"
    ON_TOOL_START = "on_tool_start"
    ON_TOOL_END = "on_tool_end"
