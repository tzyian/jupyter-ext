"""Utility functions for the selenepy extension."""
import functools
import json
import logging
import traceback
from typing import Any, Callable

LOGGER = logging.getLogger(__name__)


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


def handle_exceptions(method: Callable) -> Callable:
    """Decorator to handle exceptions in API handlers and return 500 errors."""

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        try:
            return method(self, *args, **kwargs)
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.error(f"Error in {method.__name__}", exc_info=error)
            traceback.print_exc()
            self.set_status(500)
            self.finish(json.dumps({"error": str(error)}))

    return wrapper


__all__ = ["safe_int", "handle_exceptions"]
