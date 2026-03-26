"""SSE stream writer for suggestion endpoints."""

from __future__ import annotations

import json
from typing import Any, Mapping

from jupyter_server.base.handlers import APIHandler


class SuggestionStreamWriter:
    """Writes Server-Sent Events to the client for suggestion streaming."""

    def __init__(self, handler: APIHandler) -> None:
        self._handler = handler
        self._closed = False

    async def send_status(self, phase: str) -> None:
        """Send a status event (e.g., 'started', 'complete')."""
        await self._send({"type": "status", "phase": phase})

    async def send_suggestion(self, payload: Mapping[str, Any]) -> None:
        """Send a suggestion payload event."""
        await self._send({"type": "suggestion", "payload": dict(payload)})

    async def send_info(self, message: str) -> None:
        """Send an informational message event."""
        await self._send({"type": "info", "message": message})

    async def _send(self, payload: Mapping[str, Any]) -> None:
        """Internal method to write SSE formatted data."""
        if self._closed:
            return
        try:
            chunk = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            self._handler.write(chunk)
            await self._handler.flush()
        except Exception:
            # Stream is closed, mark it and silently fail
            self._closed = True

    async def close(self) -> None:
        """Close the stream and finish the response."""
        if self._closed:
            return
        self._closed = True
        self._handler.finish()


__all__ = ["SuggestionStreamWriter"]
