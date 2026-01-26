"""Tornado route handlers for the selenepy JupyterLab extension."""
import json
import logging
from typing import Any, Mapping

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from .streaming import SuggestionStreamWriter
from .suggestions import apply_scan_scope, stream_live_suggestions

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


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
    """Handler for Server-Sent Event stream of LLM suggestions."""

    @tornado.web.authenticated
    async def post(self) -> None:
        self.set_header("Content-Type", "text/event-stream")
        self.set_header("Cache-Control", "no-cache")
        self.set_header("X-Accel-Buffering", "no")
        self.set_header("Connection", "keep-alive")

        try:
            params = self._parse_request_params()
            await self._run_suggestion_stream(params)
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error("Suggested edits stream failed", exc_info=error)
            writer = SuggestionStreamWriter(self)
            await writer.send_info(f"Error generating suggestions: {error}")
            await writer.send_status("complete")
            await writer.close()

    def _parse_request_params(self) -> Mapping[str, Any]:
        """Extract and validate request parameters from the body."""
        body = self.get_json_body() or {}
        snapshot = body.get("snapshot") or {}
        settings = body.get("settings") or {}
        mode = str(body.get("mode", "context")).lower()
        if mode not in {"context", "full"}:
            mode = "context"
        context_window = _safe_int(settings.get("contextWindow"), 3)

        return {
            "snapshot": snapshot,
            "settings": settings,
            "mode": mode,
            "context_window": context_window,
        }

    async def _run_suggestion_stream(self, params: Mapping[str, Any]) -> None:
        """Orchestrate the suggestion generation and streaming process."""
        snapshot = params["snapshot"]
        mode = params["mode"]
        context_window = params["context_window"]

        # Log the request details
        LOGGER.info(
            "LLM REQUEST (mode=%s, window=%s, path=%s)",
            mode,
            context_window,
            snapshot.get("path", "unknown"),
        )
        LOGGER.debug(
            "SNAPSHOT DATA: %s", json.dumps(snapshot, ensure_ascii=False)[:1200]
        )

        writer = SuggestionStreamWriter(self)
        await writer.send_status("started")

        try:
            target_snapshot = apply_scan_scope(snapshot, mode, context_window)
            async for suggestion in stream_live_suggestions(target_snapshot, mode):
                await writer.send_suggestion(suggestion)
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        finally:
            await writer.send_status("complete")
            await writer.close()


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


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
