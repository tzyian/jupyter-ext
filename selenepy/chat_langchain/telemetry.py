from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig

try:
    from langfuse import get_client
    from langfuse.langchain import CallbackHandler
except Exception:
    get_client = None
    CallbackHandler = None

load_dotenv()


langfuse = get_client() if get_client else None


def callbacks_config() -> RunnableConfig:
    if CallbackHandler is None:
        return {}

    handler = CallbackHandler()

    return {"callbacks": [handler]}
