from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

class NotebookOutlineItem(BaseModel):
    """Represents an entry in the notebook's logical outline."""

    level: int
    text: str
    cellIndex: int


class NotebookCellSnapshot(BaseModel):
    """Snapshot of a single notebook cell at a point in time."""

    cellType: Literal["code", "markdown", "raw"]
    source: str
    cellIndex: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActiveCellContext(BaseModel):
    """Optional state information about the currently active cell's editor."""

    cellIndex: int
    cursorOffset: Optional[int] = None
    selectedText: Optional[str] = None


class NotebookSnapshot(BaseModel):
    """Complete snapshot of a notebook's state and contents."""

    path: str
    activeCellIndex: int
    activeCellContext: Optional[ActiveCellContext] = None
    outline: list[NotebookOutlineItem] = Field(default_factory=list)
    cells: list[NotebookCellSnapshot] = Field(default_factory=list)
    lastActivity: str


__all__ = [
    "NotebookOutlineItem",
    "NotebookCellSnapshot",
    "ActiveCellContext",
    "NotebookSnapshot",
]

