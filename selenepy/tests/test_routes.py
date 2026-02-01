import json
from unittest.mock import AsyncMock, MagicMock, patch

from selenepy.suggestions.models import SuggestedEditModel, SuggestedEditsPayload


async def test_hello(jp_fetch):
    # When
    response = await jp_fetch("selenepy", "hello")

    # Then
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
            "data": (
                "Hello, world!"
                " This is the '/selenepy/hello' endpoint."
                " Try visiting me in your browser!"
            ),
        }


async def test_suggestions_stream(jp_fetch):
    # Setup mock for OpenAI client
    mock_suggestion = SuggestedEditModel(
        id="test-id",
        title="Test Suggestion",
        description="Test Description",
        cellIndex=0,
        replacementSource="print('hello')",
        contextType="local",
    )
    mock_payload = SuggestedEditsPayload(suggestions=[mock_suggestion])

    mock_response = MagicMock()
    mock_response.output_parsed = mock_payload

    mock_client = MagicMock()
    mock_client.responses.parse = AsyncMock(return_value=mock_response)

    with patch(
        "selenepy.suggestions.service._get_openai_client", return_value=mock_client
    ):
        # When
        body = {
            "snapshot": {
                "path": "test.ipynb",
                "cells": [{"cellIndex": 0, "cellType": "code", "source": "print(1)"}],
                "activeCellIndex": 0,
            },
            "settings": {"contextWindow": 1},
            "mode": "context",
        }

        response = await jp_fetch(
            "selenepy", "suggestions", "stream", method="POST", body=json.dumps(body)
        )

        # Then
        assert response.code == 200
        lines = response.body.decode().split("\n\n")

        # Filter out empty lines
        events = [line for line in lines if line.strip()]

        assert len(events) >= 3  # started, suggestion, complete

        assert json.loads(events[0].replace("data: ", ""))["phase"] == "started"

        suggestion_event = json.loads(events[1].replace("data: ", ""))
        assert suggestion_event["type"] == "suggestion"
        assert suggestion_event["payload"]["id"] == "test-id"

        assert json.loads(events[-1].replace("data: ", ""))["phase"] == "complete"


async def test_suggestions_stream_error(jp_fetch):
    # Setup mock for OpenAI client to raise an exception
    with patch(
        "selenepy.suggestions.service._get_openai_client",
        side_effect=RuntimeError("API Error"),
    ):
        body = {
            "snapshot": {"cells": []},
            "settings": {},
            "mode": "context",
        }

        response = await jp_fetch(
            "selenepy", "suggestions", "stream", method="POST", body=json.dumps(body)
        )

        assert response.code == 200
        events = [line for line in response.body.decode().split("\n\n") if line.strip()]

        # Should contain error message in an 'info' event or similar
        error_events = [e for e in events if '"info"' in e]
        assert len(error_events) > 0
        assert "Error generating suggestions" in error_events[0]


async def test_suggestions_stream_missing_params(jp_fetch):
    # Empty body should still return status complete (graceful failure)
    response = await jp_fetch(
        "selenepy", "suggestions", "stream", method="POST", body=json.dumps({})
    )

    assert response.code == 200
    events = [line for line in response.body.decode().split("\n\n") if line.strip()]
    assert any('"started"' in e for e in events)
    assert any('"complete"' in e for e in events)
