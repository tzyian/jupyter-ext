import asyncio
import json
import uuid


import tornado
from jupyter_server.base.handlers import APIHandler

from pydantic import ValidationError

from selenepy.chat.writer import ChatStreamWriter
from selenepy.db.chat_db import ChatDB
from selenepy.chat.get_chat_langchain_service import get_chat_langchain_service
from selenepy.chat.models import ChatStreamPayload
from selenepy.utils.logging import get_logger
from selenepy.utils.openai_config import resolve_openai_api_key
from selenepy.utils.sse import set_sse_headers
from selenepy.utils.utils import format_snapshot_for_prompt

LOGGER = get_logger(__name__)


class ChatStreamHandler(APIHandler):
    """SSE handler for chat streaming; persists messages when a thread_id is given."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db
        self._client_disconnected = False

    def on_connection_close(self) -> None:
        """Track client disconnects so long-running chat tasks can be cancelled."""
        self._client_disconnected = True
        LOGGER.info("Client connection closed for chat stream")

    @tornado.web.authenticated
    async def post(self) -> None:
        set_sse_headers(self)

        body = self.get_json_body() or {}
        try:
            payload = ChatStreamPayload.model_validate(body)
        except ValidationError as e:
            self.set_status(400)
            self.finish(json.dumps({"error": str(e)}))
            return

        message = payload.message
        snapshot = payload.snapshot
        settings = payload.settings
        thread_id = payload.thread_id
        thread_id_str = str(thread_id) if thread_id is not None else None
        openai_api_key = resolve_openai_api_key(settings=settings, body=body)

        if not message:
            self.set_status(400)
            self.finish(json.dumps({"error": "Message is required"}))
            return

        persist = bool(thread_id_str) and self.chat_db.thread_exists(thread_id_str)
        if persist:
            assert thread_id_str is not None
            self.chat_db.touch_thread(thread_id_str)

        writer = ChatStreamWriter(self)
        await writer.send_status("started")

        try:
            service = await get_chat_langchain_service()
            notebook_path = ""
            notebook_context = ""
            active_cell_index = -1
            if snapshot is not None:
                notebook_path = snapshot.path.strip()
                active_cell_index = snapshot.activeCellIndex
                try:
                    notebook_context = format_snapshot_for_prompt(snapshot)
                except Exception as e:
                    LOGGER.warning("Failed to format notebook snapshot: %s", e)
                    notebook_context = ""

            session_id = (
                f"thread:{thread_id_str}"
                if persist and thread_id_str
                else f"adhoc:{uuid.uuid4().hex}"
            )

            chat_stream = service.chat_turn_stream(
                session_id=session_id,
                user_message=message,
                openai_api_key=openai_api_key,
                notebook_path=notebook_path,
                notebook_context=notebook_context,
                active_cell_index=active_cell_index,
                system_prompt=str(settings.get("chatSystemPrompt", "")),
            )

            prompt_tokens = 0
            total_tokens = 0

            async for chunk in chat_stream:
                if self._client_disconnected or writer.is_closed:
                    LOGGER.info(
                        "Cancelled backend chat stream due to client disconnect"
                    )
                    break

                chunk_type = chunk.get("type")

                if chunk_type == "chunk":
                    await writer.send_chunk(chunk.get("content", ""))
                elif chunk_type == "intermediate_chunk":
                    # Send intermediate thought
                    await writer._send(
                        {
                            "type": "intermediate_chunk",
                            "agent": chunk.get("agent", "unknown"),
                            "content": chunk.get("content", ""),
                        }
                    )
                elif chunk_type == "tool_call":
                    # Send tool call
                    await writer._send(
                        {
                            "type": "tool_call",
                            "name": chunk.get("name", "unknown"),
                            "input": chunk.get("input", ""),
                        }
                    )
                elif chunk_type == "tool_result":
                    # Send tool result
                    await writer._send(
                        {
                            "type": "tool_result",
                            "name": chunk.get("name", "unknown"),
                            "status": "done",
                        }
                    )
                elif chunk_type == "error":
                    await writer.send_error(
                        chunk.get("message", "Unknown error in stream")
                    )
                    break

            await writer.send_metrics(
                tokens_used=total_tokens, tokens_sent=prompt_tokens, messages_sent=1
            )

        except tornado.iostream.StreamClosedError:
            LOGGER.info("Client disconnected from chat stream.")
        except asyncio.CancelledError:
            LOGGER.info("Chat stream task cancelled after client disconnect")
            return
        except Exception as error:
            LOGGER.error("Error during chat stream", exc_info=error)
            await writer.send_error(str(error))
        finally:
            await writer.send_status("complete")
            await writer.close()
