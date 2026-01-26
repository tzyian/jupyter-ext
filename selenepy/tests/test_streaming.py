from unittest.mock import AsyncMock, MagicMock

import pytest

from selenepy.streaming import SuggestionStreamWriter


@pytest.mark.asyncio
async def test_suggestion_stream_writer():
    # Mock Tornado handler
    handler = MagicMock()
    handler.write = MagicMock()
    handler.flush = AsyncMock()
    handler.finish = MagicMock()
    
    writer = SuggestionStreamWriter(handler)
    
    # Test send_status
    await writer.send_status("started")
    handler.write.assert_called_with('data: {"type": "status", "phase": "started"}\n\n')
    handler.flush.assert_called()
    
    # Test send_suggestion
    handler.write.reset_mock()
    suggestion = {"id": "1", "title": "test"}
    await writer.send_suggestion(suggestion)
    handler.write.assert_called_with('data: {"type": "suggestion", "payload": {"id": "1", "title": "test"}}\n\n')
    
    # Test send_info
    handler.write.reset_mock()
    await writer.send_info("hello")
    handler.write.assert_called_with('data: {"type": "info", "message": "hello"}\n\n')
    
    # Test close
    await writer.close()
    handler.finish.assert_called_once()
    
    # Test second close (should be no-op)
    handler.finish.reset_mock()
    await writer.close()
    handler.finish.assert_not_called()
    
    # Test send after close (should be no-op)
    handler.write.reset_mock()
    await writer.send_status("done")
    handler.write.assert_not_called()
