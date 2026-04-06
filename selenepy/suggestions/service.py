import asyncio
import os
import uuid
from functools import lru_cache
from typing import Any, AsyncIterator, Dict, Mapping

from dotenv import load_dotenv
from openai import AsyncOpenAI
from openai.types.responses.response_input_param import ResponseInputItemParam

from ..utils.logging import get_logger
from ..utils.openai_config import (
    OPENAI_API_KEY_ENV_VAR,
    normalize_api_key,
    resolve_openai_api_key,
)
from ..utils.utils import format_snapshot_for_prompt
from .models import (
    NotebookSnapshot,
    SuggestedEditModel,
    SuggestedEditsPayload,
    SuggestionContextType,
)

LOGGER = get_logger(__name__)

OPENAI_MODEL_ENV_VAR = "OPENAI_MODEL"
DEFAULT_OPENAI_MODEL = "gpt-5.4-nano"

load_dotenv()


@lru_cache(maxsize=1)
def _get_openai_client() -> AsyncOpenAI:
    env_key = resolve_openai_api_key()
    if not env_key:
        raise RuntimeError(
            f"{OPENAI_API_KEY_ENV_VAR} must be configured to use live LLM suggestions."
        )
    return AsyncOpenAI(api_key=env_key)


def apply_scan_scope(
    snapshot: NotebookSnapshot, mode: str, context_window: int
) -> NotebookSnapshot:
    """Limit snapshot content when operating in context-sensitive mode."""
    if mode != "context":
        return snapshot

    cells = snapshot.cells
    active = snapshot.activeCellIndex
    if not cells:
        return snapshot

    limit = max(0, context_window)
    start = max(0, active - limit)
    end = active + limit + 1

    filtered_cells = [cell for cell in cells if start <= cell.cellIndex < end]
    filtered_outline = [item for item in snapshot.outline if start <= item.cellIndex < end]

    return snapshot.model_copy(
        update={"cells": filtered_cells, "outline": filtered_outline}
    )


async def stream_live_suggestions(
    snapshot: NotebookSnapshot,
    mode: str,
    system_prompt: str = "",
    openai_api_key: str | None = None,
) -> AsyncIterator[Mapping[str, Any]]:
    """Yield structured suggestions from the OpenAI Responses API."""
    settings_key = normalize_api_key(openai_api_key)
    env_key = resolve_openai_api_key()

    if settings_key and settings_key != env_key:
        client = AsyncOpenAI(api_key=settings_key)
    else:
        client = _get_openai_client()

    model_name = os.getenv(OPENAI_MODEL_ENV_VAR, DEFAULT_OPENAI_MODEL)
    prompt = format_snapshot_for_prompt(snapshot)
    LOGGER.info("LLM PROMPT:\n%s", prompt)

    context_type: SuggestionContextType = "local" if mode == "context" else "global"

    current_system_prompt = system_prompt
    LOGGER.info("LLM SYSTEM PROMPT: %s...", current_system_prompt[:200])

    messages: list[ResponseInputItemParam] = [
        {"role": "system", "content": current_system_prompt},
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
            max_output_tokens=4096,
        )
    except Exception as error:
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


__all__ = [
    "apply_scan_scope",
    "stream_live_suggestions",
]
