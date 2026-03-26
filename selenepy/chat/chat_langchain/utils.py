from typing import Any

from langchain_core.messages import BaseMessage


def _to_checkpoint_message_dict(
    message: Any, thread_id: str, index: int
) -> dict[str, Any]:
    """Convert checkpoint message objects into frontend chat response shape."""
    role = "ai"
    content = ""
    message_id = None
    timestamp = None
    thoughts = None
    tool_calls = None

    def _normalize_tool_calls(raw_calls: Any) -> list[dict[str, Any]] | None:
        if not isinstance(raw_calls, list):
            return None
        normalized: list[dict[str, Any]] = []
        for item in raw_calls:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("tool_name") or item.get("id")
            input_value = item.get("input")
            if input_value is None:
                input_value = item.get("args")
            if input_value is None:
                input_value = item.get("arguments", "")
            status = str(item.get("status", "done")).lower()
            normalized.append(
                {
                    "name": str(name or "unknown"),
                    "input": input_value if input_value is not None else "",
                    "status": "active" if status == "active" else "done",
                }
            )
        return normalized or None

    def _normalize_timestamp(value: Any) -> float | None:
        if value is None:
            return None
        try:
            raw = float(value)
        except (TypeError, ValueError):
            return None

        # Milliseconds epoch values are far larger than seconds.
        if raw >= 1_000_000_000_000:
            raw = raw / 1000.0

        # Guard against implausible values that are likely parse artifacts.
        if raw <= 0:
            return None
        return raw

    if isinstance(message, BaseMessage):
        message_type = str(getattr(message, "type", "")).lower()
        if message_type == "human":
            role = "user"
        elif message_type in {"ai", "assistant"}:
            role = "ai"
        else:
            role = "ai"
        raw_content = getattr(message, "content", "")
        content = raw_content if isinstance(raw_content, str) else str(raw_content)
        message_id = getattr(message, "id", None)

        # Extract intermediate data from additional_kwargs
        kwargs = getattr(message, "additional_kwargs", {})
        thoughts = kwargs.get("thoughts")
        tool_calls = _normalize_tool_calls(
            kwargs.get("tool_calls_trace")
            or kwargs.get("toolCalls")
            or kwargs.get("tool_calls")
        )
        timestamp = _normalize_timestamp(
            kwargs.get("timestamp")
            or kwargs.get("created_at")
            or kwargs.get("createdAt")
        )

        # Fallback for standard tool calls if trace is missing
        if not tool_calls and hasattr(message, "tool_calls"):
            raw_tc = getattr(message, "tool_calls", [])
            tool_calls = _normalize_tool_calls(raw_tc)

    elif isinstance(message, dict):
        raw_role = str(message.get("role", "ai")).lower()
        role = "user" if raw_role == "user" else "ai"
        content = str(message.get("content", ""))
        message_id = message.get("id")
        additional_kwargs = message.get("additional_kwargs")
        if not isinstance(additional_kwargs, dict):
            additional_kwargs = {}

        thoughts = message.get("thoughts") or additional_kwargs.get("thoughts")
        tool_calls = _normalize_tool_calls(
            message.get("toolCalls")
            or message.get("tool_calls")
            or additional_kwargs.get("tool_calls_trace")
            or additional_kwargs.get("toolCalls")
            or additional_kwargs.get("tool_calls")
        )
        timestamp = _normalize_timestamp(
            message.get("timestamp")
            or message.get("created_at")
            or message.get("createdAt")
            or additional_kwargs.get("timestamp")
            or additional_kwargs.get("created_at")
            or additional_kwargs.get("createdAt")
        )
    else:
        content = str(message)

    normalized_id = str(message_id).strip() if message_id else f"cp-{thread_id}-{index}"

    # Try to extract timestamp from message ID (frontend creates IDs as Date.now())
    if timestamp is None and message_id:
        try:
            timestamp_ms = int(str(message_id).strip())
            if (
                1000000000000 < timestamp_ms < 10000000000000
            ):  # Reasonable timestamp range in ms
                timestamp = timestamp_ms / 1000  # Convert to seconds
        except (ValueError, TypeError):
            timestamp = None

    result = {
        "id": normalized_id,
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "timestamp": timestamp,
    }
    if thoughts:
        result["thoughts"] = thoughts
    if tool_calls:
        result["toolCalls"] = tool_calls
    return result
