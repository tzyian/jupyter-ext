import json

import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.prompts.prompt_manager import PromptManager


class PromptsHandler(APIHandler):
    """Handler for managing custom system prompts."""

    def initialize(self, prompt_manager: PromptManager):
        self.prompt_manager = prompt_manager

    @tornado.web.authenticated
    def get(self):
        prompts = self.prompt_manager.get_all_prompts()
        self.finish(json.dumps({"prompts": prompts}))

    @tornado.web.authenticated
    def post(self):
        body = self.get_json_body() or {}
        name = body.get("name")
        content = body.get("content")
        prompt_id = body.get("id")
        description = body.get("description")
        category = body.get("category", "suggestion")

        if not name or not content:
            self.set_status(400)
            self.finish(json.dumps({"error": "Name and content are required"}))
            return

        saved_prompt = self.prompt_manager.save_prompt(
            name, content, prompt_id, description, category
        )
        self.finish(json.dumps(saved_prompt))

    @tornado.web.authenticated
    def delete(self):
        prompt_id = self.get_argument("id")
        if not prompt_id:
            self.set_status(400)
            self.finish(json.dumps({"error": "Prompt ID is required"}))
            return

        success = self.prompt_manager.delete_prompt(prompt_id)
        if success:
            self.set_status(204)
            self.finish()
        else:
            self.set_status(400)
            self.finish(
                json.dumps(
                    {
                        "error": "Could not delete prompt (it might be default or not exist)"
                    }
                )
            )