import json
from typing import Any, Mapping

from jupyter_server.base.handlers import APIHandler
from tornado import iostream


class ChatStreamWriter:
    """Writes Server-Sent Events to the client for chat streaming."""

    def __init__(self, handler: APIHandler) -> None:
        self._handler = handler
        self._closed = False

    @property
    def is_closed(self) -> bool:
        return self._closed

    async def send_status(self, phase: str) -> None:
        await self._send({"type": "status", "phase": phase})

    async def send_chunk(self, content: str) -> None:
        await self._send({"type": "chunk", "content": content})

    async def send_error(self, message: str) -> None:
        await self._send({"type": "error", "message": message})

    async def send_metrics(
        self, tokens_used: int, tokens_sent: int, messages_sent: int
    ) -> None:
        await self._send(
            {
                "type": "metrics",
                "tokensUsed": tokens_used,
                "tokensSent": tokens_sent,
                "messagesSent": messages_sent,
            }
        )

    async def _send(self, payload: Mapping[str, Any]) -> None:
        if self._closed:
            return
        try:
            chunk = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            self._handler.write(chunk)
            await self._handler.flush()
        except iostream.StreamClosedError:
            self._closed = True
        except Exception:
            self._closed = True

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._handler.finish()
