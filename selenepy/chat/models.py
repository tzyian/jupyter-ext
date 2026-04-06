from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field
from selenepy.models import NotebookSnapshot


class ThreadCreatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = "New Chat"


class ThreadUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    last_response_duration: Optional[float] = None


class ChatStreamPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: str
    snapshot: Optional[NotebookSnapshot] = None
    settings: dict[str, Any] = Field(default_factory=dict)
    thread_id: Optional[str] = None


__all__ = ["ThreadCreatePayload", "ThreadUpdatePayload", "ChatStreamPayload"]
