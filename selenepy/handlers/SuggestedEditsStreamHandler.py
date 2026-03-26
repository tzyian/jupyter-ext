import json
from typing import Any, Mapping

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.prompts.prompt_manager import PromptManager
from selenepy.suggestions import apply_scan_scope, stream_live_suggestions
from selenepy.suggestions.writer import SuggestionStreamWriter
from selenepy.utils.logging import get_logger
from selenepy.utils.openai_config import resolve_openai_api_key
from selenepy.utils.sse import set_sse_headers
from selenepy.utils.utils import safe_int

LOGGER = get_logger(__name__)


class SuggestedEditsStreamHandler(APIHandler):
    """Handler for Server-Sent Event stream of LLM suggestions."""

    def initialize(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    @tornado.web.authenticated
    async def post(self) -> None:
        set_sse_headers(self)

        params = self._parse_request_params()
        await self._run_suggestion_stream(params)

    def _parse_request_params(self) -> Mapping[str, Any]:
        """Extract and validate request parameters from the body."""
        body = self.get_json_body() or {}
        snapshot = body.get("snapshot") or {}
        settings = body.get("settings") or {}
        mode = str(body.get("mode", "context")).lower()
        if mode not in {"context", "full"}:
            mode = "context"
        context_window = safe_int(settings.get("contextWindow"), 3)
        prompt_id = body.get("promptId", "default_local")
        openai_api_key = resolve_openai_api_key(settings=settings, body=body)

        return {
            "snapshot": snapshot,
            "settings": settings,
            "mode": mode,
            "context_window": context_window,
            "prompt_id": prompt_id,
            "openai_api_key": openai_api_key,
        }

    async def _run_suggestion_stream(self, params: Mapping[str, Any]) -> None:
        """Orchestrate the suggestion generation and streaming process."""
        snapshot = params["snapshot"]
        mode = params["mode"]
        context_window = params["context_window"]
        prompt_id = params["prompt_id"]
        openai_api_key = params.get("openai_api_key", "")

        # Log the request details
        LOGGER.info(
            "LLM REQUEST (mode=%s, window=%s, path=%s, prompt_id=%s)",
            mode,
            context_window,
            snapshot.get("path", "unknown"),
            prompt_id,
        )
        LOGGER.debug(
            "SNAPSHOT DATA: %s", json.dumps(snapshot, ensure_ascii=False)[:1200]
        )

        writer = SuggestionStreamWriter(self)
        await writer.send_status("started")

        # Resolve system prompt
        prompt_data = self.prompt_manager.get_prompt_by_id(prompt_id)
        system_prompt = prompt_data["content"] if prompt_data else None

        try:
            target_snapshot = apply_scan_scope(snapshot, mode, context_window)
            async for suggestion in stream_live_suggestions(
                target_snapshot, mode, system_prompt, openai_api_key=openai_api_key
            ):
                await writer.send_suggestion(suggestion)
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        except Exception as error:
            LOGGER.error("Error during suggestion stream", exc_info=error)
            try:
                await writer.send_info(f"Error generating suggestions: {error}")
            except Exception:
                pass  # Stream already closed, ignore
        finally:
            try:
                await writer.send_status("complete")
                await writer.close()
            except Exception:
                pass  # Stream already closed, ignore
