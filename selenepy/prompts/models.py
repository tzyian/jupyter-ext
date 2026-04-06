from typing import Optional
from pydantic import BaseModel, ConfigDict


class PromptPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    content: str
    id: Optional[str] = None
    description: Optional[str] = None
    category: str = "suggestion"


__all__ = ["PromptPayload"]
