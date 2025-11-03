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

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


load_dotenv()

_LIVE_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "suggested_edits_response",
        "schema": {
            "type": "object",
            "properties": {
                "suggestions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": [
                            "title",
                            "description",
                            "cellIndex",
                            "replacementSource",
                        ],
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "cellIndex": {"type": "integer"},
                            "replacementSource": {"type": "string"},
                            "rationale": {"type": "string"},
                        },
                        "additionalProperties": False,
                    },
                    "maxItems": 6,
                }
            },
            "required": ["suggestions"],
            "additionalProperties": False,
        },
    },
}

_SYSTEM_PROMPT = (
    "You review Jupyter notebooks and propose clear, actionable edits. "
    "Return only JSON matching the provided schema. "
    "Each suggestion must target one cell, cite its index, summarize the change, "
    "and provide replacement cell source text that implements the edit. "
    "Avoid repetitive or generic advice; tailor each suggestion to the supplied context and current focus."
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
        llm_mode = str(settings.get("llmMode", "mock")).lower()
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
            if llm_mode == "live" and not _can_use_live_llm():
                await writer.send_info(
                    "LLM unavailable: configure OPENAI_API_KEY and install the openai package to enable live suggestions."
                )
                llm_mode = "mock"

            if llm_mode == "live":
                async for suggestion in stream_live_suggestions(target_snapshot):
                    await writer.send_suggestion(suggestion)
            else:
                await writer.send_info("LLM suggestions are currently unavailable.")
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        except Exception as error:  # pylint: disable=broad-except
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


def _can_use_live_llm() -> bool:
    if not os.getenv("OPENAI_API_KEY"):
        return False
    spec = importlib.util.find_spec("openai")
    if spec is None:
        return False
    return True


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
def _get_openai_client():
    from openai import AsyncOpenAI  # type: ignore  # pylint: disable=import-error

    api_key = os.environ["OPENAI_API_KEY"]
    base_url = os.getenv("OPENAI_BASE_URL")
    organization = os.getenv("OPENAI_ORG")

    kwargs: Dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    if organization:
        kwargs["organization"] = organization
    return AsyncOpenAI(**kwargs)


async def stream_live_suggestions(
    snapshot: Mapping[str, Any],
) -> AsyncIterator[Mapping[str, Any]]:
    client = _get_openai_client()
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    prompt = _format_snapshot_for_prompt(snapshot)
    LOGGER.info("LLM PROMPT:\n%s", prompt)

    messages = [
        {"role": "system", "content": [{"type": "text", "text": _SYSTEM_PROMPT}]},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Notebook context follows. Use it to craft suggestions.\n\n"
                        f"{prompt}"
                    ),
                }
            ],
        },
    ]

    try:
        response = await client.responses.create(  # type: ignore[arg-type]
            model=model_name,
            input=messages,
            response_format=_LIVE_RESPONSE_FORMAT,
            max_output_tokens=1024,
        )
    except Exception as error:  # pylint: disable=broad-except
        LOGGER.error("OpenAI request failed", exc_info=error)
        raise RuntimeError(f"OpenAI request failed: {error}") from error

    payload = _extract_suggestions_from_response(response)
    suggestions = payload.get("suggestions", [])

    LOGGER.info(
        "LLM RESPONSE raw payload: %s", json.dumps(payload, ensure_ascii=False)[:2000]
    )

    if not suggestions:
        return

    for raw in suggestions:
        normalized = _normalize_llm_suggestion(raw)
        LOGGER.info(
            "LLM RESPONSE suggestion: %s", json.dumps(normalized, ensure_ascii=False)
        )
        yield normalized
        await asyncio.sleep(0.05)


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


def _safe_cell(
    cells: Iterable[MutableMapping[str, Any]], index: int
) -> MutableMapping[str, Any] | None:
    cells_list = list(cells)
    if not cells_list:
        return None
    if index < 0:
        index = 0
    if index >= len(cells_list):
        index = len(cells_list) - 1
    return cells_list[index]


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


def _extract_suggestions_from_response(response: Any) -> Dict[str, Any]:
    payload: Optional[Mapping[str, Any]] = None

    for output in getattr(response, "output", []) or []:
        for content in getattr(output, "content", []) or []:
            content_type = getattr(content, "type", "")
            if content_type == "output_json":
                candidate = getattr(content, "json", None)
                if isinstance(candidate, Mapping):
                    payload = candidate
                    break
            elif content_type == "text":
                text_value = getattr(content, "text", None)
                text_str = _coerce_response_text(text_value)
                if text_str:
                    try:
                        payload = json.loads(text_str)
                        break
                    except json.JSONDecodeError:
                        continue
        if payload is not None:
            break

    if payload is None:
        text = getattr(response, "output_text", None)
        text_str = _coerce_response_text(text)
        if text_str:
            payload = json.loads(text_str)

    if payload is None:
        raise ValueError("OpenAI response did not include valid suggestions JSON.")

    if not isinstance(payload, Mapping):
        raise ValueError("LLM suggestions payload is not a JSON object.")

    return dict(payload)


def _coerce_response_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "value"):
        return str(getattr(value, "value"))
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        collected = "".join(str(part) for part in value)
        return collected or None
    return str(value)


def _normalize_llm_suggestion(raw: Mapping[str, Any]) -> Dict[str, Any]:
    title = str(raw.get("title", "Suggested Edit")).strip() or "Suggested Edit"
    description = str(raw.get("description", ""))
    cell_index = int(raw.get("cellIndex", 0))
    replacement = str(raw.get("replacementSource", ""))
    rationale = raw.get("rationale")

    suggestion: Dict[str, Any] = {
        "id": str(raw.get("id") or uuid.uuid4().hex),
        "title": title,
        "description": description,
        "cellIndex": cell_index,
        "replacementSource": replacement,
    }

    if rationale:
        suggestion["rationale"] = str(rationale)

    return suggestion


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
