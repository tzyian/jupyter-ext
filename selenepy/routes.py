"""Tornado route handlers for the selenepy JupyterLab extension."""
import json
import logging
from typing import Any, Mapping

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from .prompts import PromptManager
from .streaming import SuggestionStreamWriter
from .suggestions import apply_scan_scope, stream_live_suggestions
from .telemetry_db import TelemetryDB
from .utils import safe_int

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


class PromptsHandler(APIHandler):
    """Handler for managing custom system prompts."""

    def initialize(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    @tornado.web.authenticated
    def get(self):
        prompts = self.prompt_manager.get_all_prompts()
        self.finish(json.dumps({"prompts": prompts}))

    @tornado.web.authenticated
    def post(self):
        body = self.get_json_body() or {}
        name = body.get("name")
        content = body.get("content")
        prompt_id = body.get("id")

        if not name or not content:
            self.set_status(400)
            self.finish(json.dumps({"error": "Name and content are required"}))
            return

        saved_prompt = self.prompt_manager.save_prompt(name, content, prompt_id)
        self.finish(json.dumps(saved_prompt))

    @tornado.web.authenticated
    def delete(self):
        prompt_id = self.get_argument("id")
        if not prompt_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Prompt ID is required"}))
            return

        success = self.prompt_manager.delete_prompt(prompt_id)
        if success:
            self.set_status(204)
            self.finish()
        else:
            self.set_status(400)
            self.finish(
                json.dumps(
                    {
                        "error": "Could not delete prompt (it might be default or not exist)"
                    }
                )
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
    """Handler for Server-Sent Event stream of LLM suggestions."""

    def initialize(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    @tornado.web.authenticated
    async def post(self) -> None:
        self.set_header("Content-Type", "text/event-stream")
        self.set_header("Cache-Control", "no-cache")
        self.set_header("X-Accel-Buffering", "no")
        self.set_header("Connection", "keep-alive")

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
        prompt_id = body.get("promptId", "default")

        return {
            "snapshot": snapshot,
            "settings": settings,
            "mode": mode,
            "context_window": context_window,
            "prompt_id": prompt_id,
        }

    async def _run_suggestion_stream(self, params: Mapping[str, Any]) -> None:
        """Orchestrate the suggestion generation and streaming process."""
        snapshot = params["snapshot"]
        mode = params["mode"]
        context_window = params["context_window"]
        prompt_id = params["prompt_id"]

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
                target_snapshot, mode, system_prompt
            ):
                await writer.send_suggestion(suggestion)
        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from suggestion stream.")
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error("Error during suggestion stream", exc_info=error)
            try:
                await writer.send_info(f"Error generating suggestions: {error}")
            except Exception:  # pylint: disable=broad-except
                pass  # Stream already closed, ignore
        finally:
            try:
                await writer.send_status("complete")
                await writer.close()
            except Exception:  # pylint: disable=broad-except
                pass  # Stream already closed, ignore




class TelemetryHandler(APIHandler):
    """Handler for telemetry event logging and statistics retrieval."""

    def initialize(self, db: TelemetryDB):
        """Initialize with telemetry database instance."""
        self.db = db

    @tornado.web.authenticated
    def post(self) -> None:
        """Receive and store telemetry events from the frontend."""
        try:
            body = self.get_json_body() or {}
            events = body.get("events", [])

            LOGGER.info(f"[Telemetry] Received {len(events)} events from frontend")

            if not events:
                self.set_status(400)
                self.finish({"error": "No events provided"})
                return

            count = self.db.insert_events_batch(events)
            LOGGER.info(
                f"[Telemetry] Successfully inserted {count} events into database"
            )
            self.finish({"inserted": count})

        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error("Failed to insert telemetry events", exc_info=error)
            self.set_status(500)
            self.finish({"error": str(error)})

    @tornado.web.authenticated
    def get(self) -> None:
        """Retrieve aggregated telemetry statistics for the dashboard."""
        try:
            start_time = self.get_argument("start_time", None)
            end_time = self.get_argument("end_time", None)

            LOGGER.info(
                f"[Telemetry] Stats request: start_time={start_time}, end_time={end_time}"
            )

            start_float = float(start_time) if start_time else None
            end_float = float(end_time) if end_time else None

            stats = self.db.get_summary_stats(start_float, end_float)

            LOGGER.info(
                f"[Telemetry] Stats result: {stats.get('event_counts', {})}, "
                f"editing_time={stats.get('total_editing_time_seconds', 0):.2f}s, "
                f"away_time={stats.get('total_away_time_seconds', 0):.2f}s"
            )

            self.finish(stats)

        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error("Failed to retrieve telemetry stats", exc_info=error)
            self.set_status(500)
            self.finish({"error": str(error)})


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Initialize services
    telemetry_db = TelemetryDB()
    prompt_manager = PromptManager()

    hello_route_pattern = url_path_join(base_url, "selenepy", "hello")
    stream_route_pattern = url_path_join(base_url, "selenepy", "suggestions", "stream")
    telemetry_route_pattern = url_path_join(base_url, "selenepy", "telemetry")
    prompts_route_pattern = url_path_join(base_url, "selenepy", "prompts")

    handlers = [
        (hello_route_pattern, HelloRouteHandler),
        (
            stream_route_pattern,
            SuggestedEditsStreamHandler,
            {"prompt_manager": prompt_manager},
        ),
        (telemetry_route_pattern, TelemetryHandler, {"db": telemetry_db}),
        (prompts_route_pattern, PromptsHandler, {"prompt_manager": prompt_manager}),
    ]

    web_app.add_handlers(host_pattern, handlers)
