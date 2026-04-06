from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class TelemetryEventModel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: str
    timestamp: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class TelemetryPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    events: list[TelemetryEventModel]


__all__ = ["TelemetryEventModel", "TelemetryPayload"]
