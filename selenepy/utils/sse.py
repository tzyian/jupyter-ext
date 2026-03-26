from jupyter_server.base.handlers import APIHandler


def set_sse_headers(handler: APIHandler) -> None:
    """Apply standard Server-Sent Events headers to the given handler."""
    handler.set_header("Content-Type", "text/event-stream")
    handler.set_header("Cache-Control", "no-cache")
    handler.set_header("X-Accel-Buffering", "no")
    handler.set_header("Connection", "keep-alive")
