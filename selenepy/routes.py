from jupyter_server.utils import url_path_join

from selenepy.handlers.ChatStreamHandler import ChatStreamHandler
from selenepy.handlers.ChatThreadMessagesHandler import ChatThreadMessagesHandler
from selenepy.handlers.ChatThreadsHandler import ChatThreadsHandler
from selenepy.handlers.PromptsHandler import PromptsHandler
from selenepy.handlers.StorageOpenHandler import StorageOpenHandler
from selenepy.handlers.SuggestedEditsStreamHandler import SuggestedEditsStreamHandler
from selenepy.handlers.TelemetryHandler import TelemetryHandler, TelemetryRenameHandler
from selenepy.handlers.TranscribeHandler import TranscribeHandler

from .db.chat_db import ChatDB
from .db.telemetry_db import TelemetryDB
from .prompts.prompt_manager import PromptManager
from .utils.logging import get_logger

LOGGER = get_logger(__name__)


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    telemetry_db = TelemetryDB()
    prompt_manager = PromptManager()
    chat_db = ChatDB()

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
    storage_open_route_pattern = url_path_join(base_url, "selenepy", "storage", "open")

    handlers = [
        (
            stream_route_pattern,
            SuggestedEditsStreamHandler,
            {"prompt_manager": prompt_manager},
        ),
        (telemetry_route_pattern, TelemetryHandler, {"db": telemetry_db}),
        (telemetry_rename_route_pattern, TelemetryRenameHandler, {"db": telemetry_db}),
        (prompts_route_pattern, PromptsHandler, {"prompt_manager": prompt_manager}),
        (storage_open_route_pattern, StorageOpenHandler),
        (chat_threads_route_pattern, ChatThreadsHandler, {"chat_db": chat_db}),
        (chat_thread_messages_pattern, ChatThreadMessagesHandler, {"chat_db": chat_db}),
        (chat_stream_route_pattern, ChatStreamHandler, {"chat_db": chat_db}),
        (transcribe_route_pattern, TranscribeHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
