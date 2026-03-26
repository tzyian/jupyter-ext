import asyncio

from .chat_langchain.service import EducatorNotebookService

_chat_langchain_service: EducatorNotebookService | None = None
_chat_langchain_service_init_lock = asyncio.Lock()


async def get_chat_langchain_service() -> EducatorNotebookService:
    """Lazily create and initialize a shared chat_langchain service instance."""
    global _chat_langchain_service

    if _chat_langchain_service is not None:
        return _chat_langchain_service

    async with _chat_langchain_service_init_lock:
        if _chat_langchain_service is None:
            service = EducatorNotebookService()
            await service.initialize()
            _chat_langchain_service = service

    return _chat_langchain_service
