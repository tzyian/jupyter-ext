"""Suggestion generation service using OpenAI structured outputs."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from functools import lru_cache
from typing import Any, AsyncIterator, Dict, Mapping, Sequence

from dotenv import load_dotenv
from openai import AsyncOpenAI
from openai.types.responses.response_input_param import ResponseInputItemParam

from .models import (
    SYSTEM_PROMPT,
    SuggestedEditModel,
    SuggestedEditsPayload,
    SuggestionContextType,
)

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

load_dotenv()
_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not _OPENAI_API_KEY:
    LOGGER.warning(
        "OPENAI_API_KEY environment variable is not set; live suggestions are disabled."
    )


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    if not _OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY must be configured to use live LLM suggestions."
        )
    return AsyncOpenAI(api_key=_OPENAI_API_KEY)


def apply_scan_scope(
    snapshot: Mapping[str, Any], mode: str, context_window: int
) -> Mapping[str, Any]:
    """Limit snapshot content when operating in context-sensitive mode."""
    if mode != "context":
        return snapshot

    cells: Sequence[Mapping[str, Any]] = snapshot.get("cells", []) or []
    active = _safe_int(snapshot.get("activeCellIndex"), 0)
    if not cells:
        return snapshot

    limit = max(0, context_window)
    start = max(0, active - limit)
    end = active + limit + 1

    filtered_cells = [
        cell for cell in cells if start <= _safe_int(cell.get("index"), 0) < end
    ]

    outline: Sequence[Mapping[str, Any]] = snapshot.get("outline", []) or []
    filtered_outline = [
        item for item in outline if start <= _safe_int(item.get("cellIndex"), 0) < end
    ]

    trimmed = dict(snapshot)
    trimmed["cells"] = filtered_cells
    trimmed["outline"] = filtered_outline
    trimmed["scanWindow"] = {"start": start, "end": max(start, end - 1)}
    return trimmed


async def stream_live_suggestions(
    snapshot: Mapping[str, Any], mode: str
) -> AsyncIterator[Mapping[str, Any]]:
    """Yield structured suggestions from the OpenAI Responses API."""
    client = _get_openai_client()
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    prompt = _format_snapshot_for_prompt(snapshot)
    LOGGER.info("LLM PROMPT:\n%s", prompt)

    context_type: SuggestionContextType = "local" if mode == "context" else "global"

    messages: list[ResponseInputItemParam] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Notebook context follows. Use it to craft suggestions.\n\n{prompt}"
            ),
        },
    ]

    try:
        response = await client.responses.parse(
            model=model_name,
            input=messages,
            text_format=SuggestedEditsPayload,
            max_output_tokens=1024,
        )
    except Exception as error:  # pylint: disable=broad-except
        LOGGER.error("OpenAI request failed", exc_info=error)
        raise RuntimeError(f"OpenAI request failed: {error}") from error

    structured = response.output_parsed
    if structured is None:
        LOGGER.info("LLM RESPONSE contained no parsed output.")
        return

    LOGGER.info(
        "LLM RESPONSE raw payload: %s",
        structured.model_dump(),
    )

    suggestions = structured.suggestions
    if not suggestions:
        return

    for suggestion in suggestions:
        normalized = _normalize_llm_suggestion(suggestion, context_type)
        LOGGER.info("LLM RESPONSE suggestion: %s", normalized)
        yield normalized
        await asyncio.sleep(0.05)


def _normalize_llm_suggestion(
    suggestion: SuggestedEditModel, fallback_context: SuggestionContextType
) -> Dict[str, Any]:
    title = suggestion.title.strip() or "Suggested Edit"
    suggestion_id = suggestion.id or uuid.uuid4().hex
    context_type: SuggestionContextType = suggestion.contextType or fallback_context

    payload: Dict[str, Any] = {
        "id": suggestion_id,
        "title": title,
        "description": suggestion.description,
        "cellIndex": suggestion.cellIndex,
        "replacementSource": suggestion.replacementSource,
        "contextType": context_type,
    }

    if suggestion.rationale:
        payload["rationale"] = suggestion.rationale

    return payload


def _format_snapshot_for_prompt(snapshot: Mapping[str, Any]) -> str:
    outline: Sequence[Mapping[str, Any]] = snapshot.get("outline", []) or []
    cells: Sequence[Mapping[str, Any]] = snapshot.get("cells", []) or []
    active_context: Mapping[str, Any] | None = snapshot.get("activeCellContext")  # type: ignore[assignment]

    lines = [
        f"Notebook path: {snapshot.get('path', 'unknown')}",
        f"Active cell index: {snapshot.get('activeCellIndex', 0)}",
        "Outline:",
    ]

    if active_context:
        cursor_offset = active_context.get("cursorOffset")
        if cursor_offset is not None:
            lines.append(f"  Cursor offset: {cursor_offset}")
        selected = _trim_text(str(active_context.get("selectedText", "")), 240)
        if selected:
            lines.append("  Selected text snippet:")
            lines.append(f"    {selected}")

    if outline:
        for item in outline:
            level = item.get("level", 1)
            text = _trim_text(str(item.get("text", "")), 120)
            cell_idx = item.get("cellIndex", 0)
            lines.append(f"  - Level {level} → cell {cell_idx}: {text}")
    else:
        lines.append("  (outline empty)")

    lines.append("Cells:")
    for cell in cells:
        idx = cell.get("index", 0)
        cell_type = cell.get("cellType", "markdown")
        source = _trim_text(str(cell.get("source", "")), 400)
        lines.append(f"  * Cell {idx} [{cell_type}]: {source}")

    return "\n".join(lines)


def _trim_text(value: str, limit: int) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


__all__ = [
    "apply_scan_scope",
    "stream_live_suggestions",
]
