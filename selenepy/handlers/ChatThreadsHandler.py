import json

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.db.chat_db import ChatDB


class ChatThreadsHandler(APIHandler):
    """CRUD handler for chat threads."""

    def initialize(self, chat_db: ChatDB):
        self.chat_db = chat_db

    @tornado.web.authenticated
    def get(self):
        """List all threads."""
        threads = self.chat_db.list_threads()
        self.finish(json.dumps({"threads": threads}))

    @tornado.web.authenticated
    def post(self):
        """Create a new thread."""
        body = self.get_json_body() or {}
        title = body.get("title", "New Chat")
        thread = self.chat_db.create_thread(title)
        self.set_status(201)
        self.finish(json.dumps(thread))

    @tornado.web.authenticated
    def patch(self):
        """Update a thread (rename or update metadata)."""
        thread_id = self.get_argument("id", None)
        if not thread_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Thread ID is required"}))
            return

        body = self.get_json_body() or {}
        updates = {}

        if "title" in body:
            updates["title"] = body["title"]
        if "last_response_duration" in body:
            updates["last_response_duration"] = body["last_response_duration"]

        if not updates:
            self.set_status(400)
            self.finish(json.dumps({"error": "No updates provided"}))
            return

        success = self.chat_db.update_thread(thread_id, **updates)
        if success:
            self.finish(json.dumps({"ok": True}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))

    @tornado.web.authenticated
    def delete(self):
        """Delete a thread and all its messages."""
        thread_id = self.get_argument("id", None)
        if not thread_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Thread ID is required"}))
            return
        success = self.chat_db.delete_thread(thread_id)
        if success:
            self.set_status(204)
            self.finish()
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Thread not found"}))