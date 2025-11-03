import asyncio
import importlib.util
import json
import logging
import os
import uuid
from functools import lru_cache
from typing import (
    Any,
    AsyncIterator,
    Dict,
    Iterable,
    Mapping,
    MutableMapping,
    Optional,
    Sequence,
)

import tornado
from dotenv import load_dotenv
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from openai import AsyncOpenAI
from openai.types.responses.response_input_param import ResponseInputItemParam
from pydantic import BaseModel, ConfigDict, ValidationError

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    LOGGER.warning(
        "OPENAI_API_KEY environment variable is not set; live suggestions are disabled."
    )


class SuggestedEditModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = None
    title: str
    description: str
    cellIndex: int
    replacementSource: str
    rationale: Optional[str] = None


class SuggestedEditsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suggestions: list[SuggestedEditModel]


SYSTEM_PROMPT = (
    "You review Jupyter notebooks and propose clear, actionable edits. "
    "Return only JSON matching the provided schema. "
    "Each suggestion must target one cell, cite its index, summarize the change, "
    "and provide replacement cell source text that implements the edit. "
    "Avoid repetitive or generic advice; tailor each suggestion to the supplied "
    "context and current focus."
)


class HelloRouteHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        self.finish(
            json.dumps(
                {
                    "data": (
                        "Hello, world!"
                        " This is the '/selenepy/hello' endpoint."
                        " Try visiting me in your browser!"
                    ),
                }
            )
        )


class SuggestedEditsStreamHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        self.set_header("Content-Type", "text/event-stream")
        self.set_header("Cache-Control", "no-cache")
        self.set_header("X-Accel-Buffering", "no")
        self.set_header("Connection", "keep-alive")

        body = self.get_json_body() or {}
        snapshot = body.get("snapshot") or {}
        settings = body.get("settings") or {}
        mode = str(body.get("mode", "context")).lower()
        if mode not in {"context", "full"}:
            mode = "context"
        context_window = _safe_int(settings.get("contextWindow"), fallback=3)

        # Log the request snapshot and settings
        LOGGER.info(
            "LLM REQUEST snapshot: %s", json.dumps(snapshot, ensure_ascii=False)[:1200]
        )
        LOGGER.info(
            "LLM REQUEST settings: %s", json.dumps(settings, ensure_ascii=False)
        )
        LOGGER.info("LLM REQUEST mode: %s, context_window: %s", mode, context_window)

        writer = SuggestionStreamWriter(self)
        await writer.send_status("started")

        try:
            target_snapshot = _apply_scan_scope(snapshot, mode, context_window)
            LOGGER.info(
                "Suggestion stream started (mode=%s, window=%s, path=%s)",
                mode,
                context_window,
                snapshot.get("path", "unknown"),
            )
            async for suggestion in stream_live_suggestions(target_snapshot):
                await writer.send_suggestion(suggestion)
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        except Exception as error:
            LOGGER.error("Suggested edits stream failed", exc_info=error)
            await writer.send_info(f"Error generating suggestions: {error}")
        finally:
            await writer.send_status("complete")
            await writer.close()


class SuggestionStreamWriter:
    def __init__(self, handler: APIHandler) -> None:
        self._handler = handler
        self._closed = False

    async def send_status(self, phase: str) -> None:
        await self._send({"type": "status", "phase": phase})

    async def send_suggestion(self, payload: Mapping[str, Any]) -> None:
        await self._send({"type": "suggestion", "payload": dict(payload)})

    async def send_info(self, message: str) -> None:
        await self._send({"type": "info", "message": message})

    async def _send(self, payload: Mapping[str, Any]) -> None:
        if self._closed:
            return
        chunk = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        self._handler.write(chunk)
        await self._handler.flush()

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._handler.finish()


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _apply_scan_scope(
    snapshot: Mapping[str, Any], mode: str, context_window: int
) -> Mapping[str, Any]:
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


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    if not OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY must be configured to use live LLM suggestions."
        )
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


async def stream_live_suggestions(
    snapshot: Mapping[str, Any],
) -> AsyncIterator[Mapping[str, Any]]:
    client = _get_openai_client()
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    prompt = _format_snapshot_for_prompt(snapshot)
    LOGGER.info("LLM PROMPT:\n%s", prompt)

    messages: list[ResponseInputItemParam] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Notebook context follows. Use it to craft suggestions.\n\n{prompt}",
        },
    ]

    try:
        response = await client.responses.parse(
            model=model_name,
            input=messages,
            text_format=SuggestedEditsPayload,
            max_output_tokens=1024,
        )
    except Exception as error:
        LOGGER.error("OpenAI request failed", exc_info=error)
        raise RuntimeError(f"OpenAI request failed: {error}") from error
    LOGGER.info("LLM RESPONSE received.")
    LOGGER.info(response)

    structured = response.output_parsed
    if not structured:
        LOGGER.info("LLM RESPONSE contained no parsed output.")
    assert structured

    LOGGER.info("LLM RESPONSE raw payload: %s", structured.model_dump())

    suggestions = structured.suggestions
    if not suggestions:
        return

    for suggestion in suggestions:
        # Produce a mapping for consumers and a JSON string for logging
        suggestion_dict = suggestion.model_dump()
        LOGGER.info("LLM RESPONSE suggestion: %s", suggestion_dict)
        yield suggestion_dict


async def _active_cell_suggestions(
    cell: Mapping[str, Any],
) -> AsyncIterator[Mapping[str, Any]]:
    cell_type = cell.get("cellType", "markdown")
    source = str(cell.get("source", ""))
    index = int(cell.get("index", 0))

    if cell_type == "code" and not source.strip().startswith(("#", '"""')):
        replacement = (
            f"# Explain what this cell computes\n{source if source else 'pass'}"
        )
        yield _make_suggestion(
            "Add a contextual comment",
            "Start code cells with a short comment describing their purpose.",
            index,
            replacement,
            rationale="Comments help LLMs and collaborators quickly understand intent.",
        )
        await asyncio.sleep(0.05)

    if cell_type == "markdown" and "##" not in source:
        replacement = (
            "## Summary\n\n"
            "Capture the main idea of this section in a concise paragraph."
        )
        yield _make_suggestion(
            "Promote structure",
            "Use second-level headings to align with the notebook outline.",
            index,
            replacement,
            rationale="Headings keep notebooks scannable and align with suggested edits UX.",
        )
        await asyncio.sleep(0.05)


async def _outline_gap_suggestions(
    snapshot: Mapping[str, Any], cells: Iterable[MutableMapping[str, Any]]
) -> AsyncIterator[Mapping[str, Any]]:
    outline = snapshot.get("outline", []) or []
    if outline:
        return

    first_markdown = next(
        (cell for cell in cells if cell.get("cellType") == "markdown"), None
    )
    if first_markdown is None:
        return

    index = int(first_markdown.get("index", 0))
    replacement = (
        "# Add an outline\n\n"
        "- Introduce the problem\n"
        "- Describe the dataset\n"
        "- Present analysis steps\n"
        "- Summarize outcomes\n"
    )
    yield _make_suggestion(
        "Create a section outline",
        "Readers benefit from a quick outline near the top of the notebook.",
        index,
        replacement,
        rationale="An outline helps the LLM keep future suggestions consistent with structure.",
    )
    await asyncio.sleep(0.05)


def _make_suggestion(
    title: str,
    description: str,
    cell_index: int,
    replacement: str,
    rationale: str | None = None,
) -> Dict[str, Any]:
    suggestion = {
        "id": uuid.uuid4().hex,
        "title": title,
        "description": description,
        "cellIndex": cell_index,
        "replacementSource": replacement,
    }
    if rationale:
        suggestion["rationale"] = rationale
    return suggestion


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


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    hello_route_pattern = url_path_join(base_url, "selenepy", "hello")
    stream_route_pattern = url_path_join(base_url, "selenepy", "suggestions", "stream")

    handlers = [
        (hello_route_pattern, HelloRouteHandler),
        (stream_route_pattern, SuggestedEditsStreamHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
