import json

import tornado
from jupyter_server.base.handlers import APIHandler

from pydantic import ValidationError
from selenepy.db.chat_db import ChatDB
from selenepy.chat.models import ThreadCreatePayload, ThreadUpdatePayload



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
        try:
            body = self.get_json_body() or {}
            payload = ThreadCreatePayload.model_validate(body)
            thread = self.chat_db.create_thread(payload.title)
            self.set_status(201)
            self.finish(json.dumps(thread))
        except ValidationError as e:
            self.set_status(400)
            self.finish(json.dumps({"error": str(e)}))

    @tornado.web.authenticated
    def patch(self):
        """Update a thread (rename or update metadata)."""
        thread_id = self.get_argument("id", None)
        if not thread_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Thread ID is required"}))
            return

        try:
            body = self.get_json_body() or {}
            payload = ThreadUpdatePayload.model_validate(body)
        except ValidationError as e:
            self.set_status(400)
            self.finish(json.dumps({"error": str(e)}))
            return

        updates = {}
        if payload.title is not None:
            updates["title"] = payload.title
        if payload.last_response_duration is not None:
            updates["last_response_duration"] = payload.last_response_duration

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