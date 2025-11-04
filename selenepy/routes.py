"""Tornado route handlers for the selenepy JupyterLab extension."""
import json
import logging
from typing import Any

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

        body = self.get_json_body() or {}
        snapshot = body.get("snapshot") or {}
        settings = body.get("settings") or {}
        mode = str(body.get("mode", "context")).lower()
        if mode not in {"context", "full"}:
            mode = "context"
        context_window = int(settings.get("contextWindow", 3))

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
            target_snapshot = apply_scan_scope(snapshot, mode, context_window)
            LOGGER.info(
                "Suggestion stream started (mode=%s, window=%s, path=%s)",
                mode,
                context_window,
                snapshot.get("path", "unknown"),
            )
            async for suggestion in stream_live_suggestions(target_snapshot, mode):
                await writer.send_suggestion(suggestion)
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error("Suggested edits stream failed", exc_info=error)
            await writer.send_info(f"Error generating suggestions: {error}")
        finally:
            await writer.send_status("complete")
            await writer.close()


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
