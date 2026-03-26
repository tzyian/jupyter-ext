import json

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.db.chat_db import ChatDB
from selenepy.chat.get_chat_langchain_service import get_chat_langchain_service


class ChatThreadMessagesHandler(APIHandler):
    """Handler for retrieving the messages of a specific thread."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db

    @tornado.web.authenticated
    async def get(self, thread_id: str):
        """Return all messages for the given thread."""
        if not self.chat_db.thread_exists(thread_id):
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))
            return

        service = await get_chat_langchain_service()
        checkpoint_thread_id = f"thread:{thread_id}"
        messages = await service.get_thread_messages(checkpoint_thread_id)
        self.finish(json.dumps({"messages": messages}))