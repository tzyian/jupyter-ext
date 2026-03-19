import asyncio
from unittest.mock import MagicMock, AsyncMock
import pytest
from selenepy.chat_langchain.service import EducatorNotebookService

@pytest.mark.asyncio
async def test_chat_system_prompt_passing():
    service = EducatorNotebookService()
    service.app = AsyncMock()
    service.app.ainvoke = AsyncMock(return_value={"done": True, "messages": []})
    
    await service.chat_turn(
        session_id="test",
        user_message="hello",
        system_prompt="Custom System Prompt"
    )
    
    # Check if ainvoke was called with the correct config
    args, kwargs = service.app.ainvoke.call_args
    assert kwargs["config"]["configurable"]["chat_system_prompt"] == "Custom System Prompt"
