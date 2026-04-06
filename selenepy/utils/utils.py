"""Utility functions for the selenepy extension."""

import functools
import json
import traceback
from typing import Any, Callable

from selenepy.models import NotebookSnapshot
from .logging import get_logger

LOGGER = get_logger(__name__)


def safe_int(value: Any, fallback: int = 0) -> int:
    """Safely convert a value to an integer, returning a fallback if it fails.

    Args:
        value: The value to convert.
        fallback: The value to return if conversion fails.

    Returns:
        The converted integer or the fallback value.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def handle_exceptions(method: Callable) -> Callable:
    """Decorator to handle exceptions in API handlers and return 500 errors."""

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        try:
            return method(self, *args, **kwargs)
        except Exception as error:
            LOGGER.error(f"Error in {method.__name__}", exc_info=error)
            traceback.print_exc()
            self.set_status(500)
            self.finish(json.dumps({"error": str(error)}))

    return wrapper


def trim_text(value: str, limit: int) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def format_snapshot_for_prompt(snapshot: NotebookSnapshot) -> str:
    outline = snapshot.outline
    cells = snapshot.cells
    active_context = snapshot.activeCellContext

    lines = [
        f"Notebook path: {snapshot.path}",
        f"Active cell index: {snapshot.activeCellIndex}",
        "--- Outline ---",
    ]

    if active_context:
        cursor_offset = active_context.cursorOffset
        if cursor_offset is not None:
            lines.append(f"Cursor offset: {cursor_offset}")
        selected = active_context.selectedText
        if selected:
            lines.append(f"Selected text snippet: {selected}")

    if outline:
        for item in outline:
            lines.append(f"L{item.level} [Cell {item.cellIndex}]: {item.text}")
    else:
        lines.append("(outline empty)")

    active_idx = snapshot.activeCellIndex
    lines.append("\n--- Cells ---")
    for cell in cells:
        idx = cell.cellIndex
        cell_type = cell.cellType
        source = cell.source

        # Keep cells within a window (+-3) full, truncate others to 500 chars
        if abs(idx - active_idx) > 3:
            source = trim_text(source, 500)

        lines.append(f"Cell {idx} [{cell_type}]:")
        lines.append(f"{source}\n")

    return "\n".join(lines)


__all__ = ["safe_int", "handle_exceptions", "trim_text", "format_snapshot_for_prompt"]
