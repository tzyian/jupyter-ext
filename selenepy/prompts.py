import json
import logging
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from .suggestions.models import SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT

LOGGER = logging.getLogger(__name__)

class PromptManager:
    """Manages custom system prompts, storing them in a JSON file."""

    def __init__(self, storage_path: Optional[Path] = None):
        if storage_path is None:
            storage_path = Path.cwd() / "custom_prompts.json"
        
        self.storage_path = storage_path
        self._default_prompt = {
            "id": "default",
            "name": "Default",
            "content": DEFAULT_SYSTEM_PROMPT,
            "isDefault": True
        }

    def _load_prompts_from_disk(self) -> List[Dict[str, Any]]:
        """Load custom prompts from disk."""
        if not self.storage_path.exists():
            return []
        
        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            LOGGER.error(f"Failed to load prompts from {self.storage_path}: {e}")
            return []

    def _save_prompts_to_disk(self, prompts: List[Dict[str, Any]]) -> None:
        """Save custom prompts to disk."""
        try:
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(prompts, f, indent=2)
        except Exception as e:
            LOGGER.error(f"Failed to save prompts to {self.storage_path}: {e}")

    def get_all_prompts(self) -> List[Dict[str, Any]]:
        """Get all prompts including the default one."""
        custom_prompts = self._load_prompts_from_disk()
        # Always return default first
        return [self._default_prompt] + custom_prompts

    def get_prompt_by_id(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific prompt by ID."""
        if prompt_id == "default":
            return self._default_prompt
        
        custom_prompts = self._load_prompts_from_disk()
        for prompt in custom_prompts:
            if prompt["id"] == prompt_id:
                return prompt
        return None

    def save_prompt(self, name: str, content: str, prompt_id: Optional[str] = None) -> Dict[str, Any]:
        """Create or update a custom prompt."""
        custom_prompts = self._load_prompts_from_disk()
        
        if prompt_id:
            # Update existing
            for prompt in custom_prompts:
                if prompt["id"] == prompt_id:
                    prompt["name"] = name
                    prompt["content"] = content
                    self._save_prompts_to_disk(custom_prompts)
                    return prompt
            # If ID provided but not found, fall through to create new (or error?)
            # For simplicity, if ID not found, we create new.
        
        # Create new
        new_prompt = {
            "id": prompt_id or uuid.uuid4().hex,
            "name": name,
            "content": content,
            "isDefault": False
        }
        custom_prompts.append(new_prompt)
        self._save_prompts_to_disk(custom_prompts)
        return new_prompt

    def delete_prompt(self, prompt_id: str) -> bool:
        """Delete a custom prompt by ID. specific default prompt cannot be deleted."""
        if prompt_id == "default":
            return False
        
        custom_prompts = self._load_prompts_from_disk()
        initial_len = len(custom_prompts)
        custom_prompts = [p for p in custom_prompts if p["id"] != prompt_id]
        
        if len(custom_prompts) < initial_len:
            self._save_prompts_to_disk(custom_prompts)
            return True
        return False
