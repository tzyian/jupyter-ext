import os
from typing import Any, Mapping

OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY"


def normalize_api_key(value: Any) -> str:
    """Normalize API key-like values to a stripped string."""
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip()
    return str(value).strip()


def resolve_openai_api_key(
    *,
    preferred_key: Any = None,
    settings: Mapping[str, Any] | None = None,
    body: Mapping[str, Any] | None = None,
    body_arguments: Mapping[str, Any] | None = None,
) -> str:
    """Resolve OpenAI API key from request payload first, then environment."""
    resolved = normalize_api_key(preferred_key)
    if resolved:
        return resolved

    if settings:
        resolved = normalize_api_key(settings.get("openaiApiKey"))
    if not resolved and body:
        resolved = normalize_api_key(body.get("openaiApiKey"))
    if not resolved and body_arguments:
        values = body_arguments.get("openaiApiKey")
        if isinstance(values, list) and values:
            resolved = normalize_api_key(values[0])
        elif values is not None:
            resolved = normalize_api_key(values)

    if resolved:
        return resolved

    return normalize_api_key(os.getenv(OPENAI_API_KEY_ENV_VAR, ""))


__all__ = [
    "OPENAI_API_KEY_ENV_VAR",
    "normalize_api_key",
    "resolve_openai_api_key",
]
