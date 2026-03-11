"""Utility functions for the selenepy extension."""
import functools
import json
import logging
import traceback
from typing import Any, Callable, Mapping, Sequence

LOGGER = logging.getLogger(__name__)


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
        except Exception as error:  # pylint: disable=broad-except
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


def format_snapshot_for_prompt(snapshot: Mapping[str, Any]) -> str:
    outline: Sequence[Mapping[str, Any]] = snapshot.get("outline", []) or []
    cells: Sequence[Mapping[str, Any]] = snapshot.get("cells", []) or []
    active_context: Mapping[str, Any] | None = snapshot.get("activeCellContext")  # type: ignore[assignment]

    lines = [
        f"Notebook path: {snapshot.get('path', 'unknown')}",
        f"Active cell index: {snapshot.get('activeCellIndex', 0)}",
        "--- Outline ---",
    ]

    if active_context:
        cursor_offset = active_context.get("cursorOffset")
        if cursor_offset is not None:
            lines.append(f"Cursor offset: {cursor_offset}")
        selected = trim_text(str(active_context.get("selectedText", "")), 240)
        if selected:
            lines.append(f"Selected text snippet: {selected}")

    if outline:
        for item in outline:
            level = item.get("level", 1)
            text = trim_text(str(item.get("text", "")), 120)
            cell_idx = item.get("cellIndex", 0)
            lines.append(f"L{level} [Cell {cell_idx}]: {text}")
    else:
        lines.append("(outline empty)")

    lines.append("\n--- Cells ---")
    for cell in cells:
        idx = cell.get("cellIndex", 0)
        cell_type = cell.get("cellType", "markdown")
        source = trim_text(str(cell.get("source", "")), 400)
        lines.append(f"Cell {idx} [{cell_type}]:")
        lines.append(f"{source}\n")

    return "\n".join(lines)


__all__ = ["safe_int", "handle_exceptions", "trim_text", "format_snapshot_for_prompt"]
