"""Utility functions for the selenepy extension."""
from typing import Any


def safe_int(value: Any, fallback: int = 0) -> int:
    """Safely convert a value to an integer, returning a fallback if it fails.

    Args:
        value: The value to convert.
        fallback: The value to return if conversion fails.

    Returns:
        The converted integer or the fallback value.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


__all__ = ["safe_int"]
