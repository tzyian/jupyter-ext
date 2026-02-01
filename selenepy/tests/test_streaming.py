import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from selenepy.streaming import SuggestionStreamWriter


@pytest.mark.asyncio
async def test_suggestion_stream_writer():
    # Mock Tornado handler
    mock_handler = MagicMock()
    mock_handler.write = MagicMock()
    mock_handler.flush = AsyncMock()
    mock_handler.finish = MagicMock()

    writer = SuggestionStreamWriter(mock_handler)
    
    # Test send_status
    await writer.send_status("started")
    mock_handler.write.assert_called_once()
    chunk = mock_handler.write.call_args[0][0]
    assert "started" in chunk
    assert chunk.startswith("data: ")
    assert chunk.endswith("\n\n")

    mock_handler.write.reset_mock()
    
    # Test send_suggestion
    await writer.send_suggestion({"id": "123", "title": "Test"})
    mock_handler.write.assert_called_once()
    chunk = mock_handler.write.call_args[0][0]
    payload = json.loads(chunk[6:])
    assert payload["type"] == "suggestion"
    assert payload["payload"]["id"] == "123"
    
    # Test close
    await writer.close()
    assert writer._closed is True
    mock_handler.finish.assert_called_once()
