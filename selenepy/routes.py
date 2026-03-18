import io
import json
import logging
import os
from logging.handlers import RotatingFileHandler
from typing import Any, Mapping

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from .chat import ChatStreamWriter, stream_chat_response
from .chat_db import ChatDB
from .prompts import PromptManager
from .streaming import SuggestionStreamWriter
from .suggestions import apply_scan_scope, stream_live_suggestions
from .telemetry_db import TelemetryDB
from .utils import handle_exceptions, safe_int

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

_LOG_DIR = os.path.join(os.path.expanduser("~"), ".selenepy", "logs")
_LOG_FILE = os.path.join(_LOG_DIR, "routes.log")

# Add a persistent file handler for backend diagnostics.
os.makedirs(_LOG_DIR, exist_ok=True)
if not any(
    isinstance(handler, RotatingFileHandler)
    and getattr(handler, "baseFilename", "") == os.path.abspath(_LOG_FILE)
    for handler in LOGGER.handlers
):
    file_handler = RotatingFileHandler(
        _LOG_FILE,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    LOGGER.addHandler(file_handler)


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
        description = body.get("description")
        category = body.get("category", "suggestion")

        if not name or not content:
            self.set_status(400)
            self.finish(json.dumps({"error": "Name and content are required"}))
            return

        saved_prompt = self.prompt_manager.save_prompt(
            name, content, prompt_id, description, category
        )
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
        openai_api_key = str(settings.get("openaiApiKey", "")).strip()

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


class ChatThreadsHandler(APIHandler):
    """CRUD handler for chat threads."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db

    @tornado.web.authenticated
    def get(self):
        """List all threads."""
        threads = self.chat_db.list_threads()
        self.finish(json.dumps({"threads": threads}))

    @tornado.web.authenticated
    def post(self):
        """Create a new thread."""
        body = self.get_json_body() or {}
        title = body.get("title", "New Chat")
        thread = self.chat_db.create_thread(title)
        self.set_status(201)
        self.finish(json.dumps(thread))

    @tornado.web.authenticated
    def patch(self):
        """Rename a thread."""
        thread_id = self.get_argument("id", None)
        if not thread_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Thread ID is required"}))
            return
        body = self.get_json_body() or {}
        title = body.get("title")
        if not title:
            self.set_status(400)
            self.finish(json.dumps({"error": "title is required"}))
            return
        success = self.chat_db.rename_thread(thread_id, title)
        if success:
            self.finish(json.dumps({"ok": True}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))

    @tornado.web.authenticated
    def delete(self):
        """Delete a thread and all its messages."""
        thread_id = self.get_argument("id", None)
        if not thread_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Thread ID is required"}))
            return
        success = self.chat_db.delete_thread(thread_id)
        if success:
            self.set_status(204)
            self.finish()
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))


class ChatThreadMessagesHandler(APIHandler):
    """Handler for retrieving the messages of a specific thread."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db

    @tornado.web.authenticated
    def get(self, thread_id: str):
        """Return all messages for the given thread."""
        if not self.chat_db.thread_exists(thread_id):
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))
            return
        messages = self.chat_db.get_messages(thread_id)
        self.finish(json.dumps({"messages": messages}))


class ChatStreamHandler(APIHandler):
    """SSE handler for chat streaming; persists messages when a thread_id is given."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db

    @tornado.web.authenticated
    async def post(self) -> None:
        self.set_header("Content-Type", "text/event-stream")
        self.set_header("Cache-Control", "no-cache")
        self.set_header("X-Accel-Buffering", "no")
        self.set_header("Connection", "keep-alive")

        body = self.get_json_body() or {}
        message = body.get("message", "")
        snapshot = body.get("snapshot")
        settings = body.get("settings", {})
        thread_id = body.get("thread_id")
        openai_api_key = settings.get("openaiApiKey", "")

        if not message:
            self.set_status(400)
            self.finish({"error": "Message is required"})
            return

        # Load history and persist user message when a valid thread is given
        history: list[dict] = []
        persist = thread_id and self.chat_db.thread_exists(thread_id)
        if persist:
            raw = self.chat_db.get_messages(thread_id)
            history = [{"role": m["role"], "content": m["content"]} for m in raw]
            self.chat_db.add_message(thread_id, "user", message)

        writer = ChatStreamWriter(self)
        ai_response = await stream_chat_response(
            message, writer, snapshot, openai_api_key=openai_api_key, history=history
        )

        # Persist AI response
        if persist and ai_response:
            self.chat_db.add_message(thread_id, "ai", ai_response)


class TelemetryHandler(APIHandler):
    """Handler for telemetry event logging and statistics retrieval."""

    def initialize(self, db: TelemetryDB):
        """Initialize with telemetry database instance."""
        self.db = db

    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        """Receive and store telemetry events from the frontend."""
        body = self.get_json_body() or {}
        events = body.get("events", [])

        LOGGER.info(f"[Telemetry] Received {len(events)} events from frontend")

        if not events:
            self.set_status(400)
            self.finish({"error": "No events provided"})
            return

        count = self.db.insert_events_batch(events)
        LOGGER.info(f"[Telemetry] Successfully inserted {count} events into database")
        self.finish({"inserted": count})

    @tornado.web.authenticated
    @handle_exceptions
    def get(self) -> None:
        """Retrieve aggregated telemetry statistics for the dashboard."""
        start_time = self.get_argument("start_time", None)
        end_time = self.get_argument("end_time", None)
        notebook_path = self.get_argument("notebook_path", None)

        LOGGER.info(
            f"[Telemetry] Stats request: start_time={start_time}, end_time={end_time}, notebook_path={notebook_path}"
        )

        start_float = float(start_time) if start_time else None
        end_float = float(end_time) if end_time else None

        stats = self.db.get_summary_stats(start_float, end_float, notebook_path)

        LOGGER.info(
            f"[Telemetry] Stats result: {stats.get('event_counts', {})}, "
            f"editing_time={stats.get('total_editing_time_seconds', 0):.2f}s, "
            f"away_time={stats.get('total_away_time_seconds', 0):.2f}s"
        )

        self.finish(stats)


class TelemetryRenameHandler(APIHandler):
    """Handler for migrating telemetry data when a notebook is renamed."""

    def initialize(self, db: TelemetryDB):
        """Initialize with telemetry database instance."""
        self.db = db

    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        """Handle notebook rename operation."""
        body = self.get_json_body() or {}
        old_path = body.get("old_path")
        new_path = body.get("new_path")

        if not old_path or not new_path:
            self.set_status(400)
            self.finish({"error": "old_path and new_path are required"})
            return

        LOGGER.info(f"[Telemetry] Rename request: {old_path} -> {new_path}")

        count = self.db.migrate_notebook_path(old_path, new_path)

        self.finish({"migrated_events": count})


class TranscribeHandler(APIHandler):
    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        from openai import OpenAI

        body = self.request.body_arguments
        if "audio" not in self.request.files:
            self.set_status(400)
            self.finish(json.dumps({"error": "audio is required"}))
            return

        if "openaiApiKey" not in body:
            self.set_status(400)
            self.finish(json.dumps({"error": "openaiApiKey is required"}))
            return

        audio_info = self.request.files["audio"][0]
        audio_data = audio_info["body"]
        filename = audio_info["filename"]
        content_type = audio_info["content_type"]

        if not audio_data:
            self.set_status(400)
            self.finish(json.dumps({"error": "audio file is empty"}))
            return

        LOGGER.log(
            logging.INFO,
            f"Received audio file: {filename} ({content_type}, {len(audio_data)} bytes)",
        )

        api_key = body["openaiApiKey"][0].decode("utf-8")

        try:
            client = OpenAI(api_key=api_key)

            audio_file = io.BytesIO(audio_data)
            audio_file.name = filename or "audio.webm"

            transcript = client.audio.transcriptions.create(
                model="whisper-1", file=audio_file
            )

            self.finish(json.dumps({"text": transcript.text}))
        except Exception as e:
            LOGGER.error(f"Transcription error: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": f"Transcription failed: {str(e)}"}))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    telemetry_db = TelemetryDB()
    prompt_manager = PromptManager()
    chat_db = ChatDB()

    hello_route_pattern = url_path_join(base_url, "selenepy", "hello")
    stream_route_pattern = url_path_join(base_url, "selenepy", "suggestions", "stream")
    chat_stream_route_pattern = url_path_join(base_url, "selenepy", "chat", "stream")
    chat_threads_route_pattern = url_path_join(base_url, "selenepy", "chat", "threads")
    chat_thread_messages_pattern = url_path_join(
        base_url, "selenepy", "chat", "threads", "([^/]+)", "messages"
    )
    telemetry_route_pattern = url_path_join(base_url, "selenepy", "telemetry")
    telemetry_rename_route_pattern = url_path_join(
        base_url, "selenepy", "telemetry", "rename"
    )
    prompts_route_pattern = url_path_join(base_url, "selenepy", "prompts")
    transcribe_route_pattern = url_path_join(base_url, "selenepy", "transcribe")

    handlers = [
        (hello_route_pattern, HelloRouteHandler),
        (
            stream_route_pattern,
            SuggestedEditsStreamHandler,
            {"prompt_manager": prompt_manager},
        ),
        (telemetry_route_pattern, TelemetryHandler, {"db": telemetry_db}),
        (telemetry_rename_route_pattern, TelemetryRenameHandler, {"db": telemetry_db}),
        (prompts_route_pattern, PromptsHandler, {"prompt_manager": prompt_manager}),
        (chat_threads_route_pattern, ChatThreadsHandler, {"chat_db": chat_db}),
        (chat_thread_messages_pattern, ChatThreadMessagesHandler, {"chat_db": chat_db}),
        (chat_stream_route_pattern, ChatStreamHandler, {"chat_db": chat_db}),
        (transcribe_route_pattern, TranscribeHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
