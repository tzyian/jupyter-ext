import os
from typing import Dict

from langchain_mcp_adapters.sessions import Connection


servers: Dict[str, Connection] = {
    "arxiv": {
        "command": "uvx",
        "args": ["arxiv-mcp-server@latest"],
        "transport": "stdio",
    },
    "jupyter": {
        "command": "uvx",
        "args": ["jupyter-mcp-server@latest"],
        "transport": "stdio",
        "env": {
            "JUPYTER_URL": os.getenv("JUPYTER_URL", "http://localhost:8888"),
            "JUPYTER_TOKEN": os.getenv("JUPYTER_TOKEN", "MY_TOKEN"),
            "ALLOW_IMG_OUTPUT": os.getenv("ALLOW_IMG_OUTPUT", "true"),
        },
    },
}
