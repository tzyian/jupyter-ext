import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from .logging import get_logger
from .paths import get_prompts_db_path, get_custom_prompts_json_path
from .suggestions.models import SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT

LOGGER = get_logger(__name__)

SAMPLE_PROMPTS = [
    # Category: suggestion
    {
        "name": "Pedagogy Expert",
        "description": "Suggestions to make code more readable and educational for students.",
        "content": "Provide suggestions to make this code more readable for students. Add comments explaining 'why' something is done, not just 'what' the code does. Suggest ways to break down complex logic into simpler steps.",
        "category": "suggestion",
    },
    {
        "name": "Exercise Generator",
        "description": "Generates follow-up exercises or comprehension questions.",
        "content": "Suggest 2-3 follow-up exercises or 'Check your understanding' questions based on this cell's content to help students solidify their learning.",
        "category": "suggestion",
    },
    # Category: chat_system_prompt
    {
        "name": "Scientific Tutor",
        "description": "Patient, encouraging tutor who explains concepts using analogies.",
        "content": "You are a patient and encouraging scientific tutor. Explain complex coding or data science concepts using analogies, step-by-step breakdowns, and clear, simple language suitable for a beginner.",
        "category": "chat_system_prompt",
    },
    {
        "name": "Teaching Assistant",
        "description": "Helper who provides hints rather than direct answers.",
        "content": "You are a Teaching Assistant helping a student. Your goal is to guide them to the answer without giving it away directly. Provide helpful hints, point out relevant documentation, or ask leading questions to help them debug their own code.",
        "category": "chat_system_prompt",
    },
    # Category: chat_snippet
    {
        "name": "Explain for Beginners",
        "description": "Simplifies code explanation for novices.",
        "content": "Explain this code in simple terms for someone who has never seen Python before. Focus on the core concepts and logic.",
        "category": "chat_snippet",
    },
    {
        "name": "Create Exercise",
        "description": "Turn code into a practice exercise.",
        "content": "Create a coding exercise based on this snippet. Include a 'problem statement', 'hints', and a 'solution' (ideally hidden or separated).",
        "category": "chat_snippet",
    },
    {
        "name": "Summarize for Students",
        "description": "Creates a concise summary for lecture materials.",
        "content": "Write a 3-sentence summary of this concept or code block that would be suitable for a lecture slide or textbook sidebar.",
        "category": "chat_snippet",
    },
    # Category: notebook_snippet
    {
        "name": "Load Sample Dataset",
        "description": "Boilerplate for loading a teaching dataset (Iris).",
        "content": "import pandas as pd\n# Loading a well-known educational dataset (Iris)\ndf = pd.read_csv('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv')\nprint(\"Dataset loaded. First 5 rows:\")\ndisplay(df.head())",
        "category": "notebook_snippet",
    },
    {
        "name": "Interactive Plot (ipywidgets)",
        "description": "Interactive visualization example for students.",
        "content": "from ipywidgets import interact\nimport matplotlib.pyplot as plt\nimport numpy as np\n\ndef plot_func(frequency=1.0):\n    x = np.linspace(0, 10, 500)\n    plt.figure(figsize=(10, 4))\n    plt.plot(x, np.sin(frequency * x), color='teal', lw=2)\n    plt.title(f'Sine Wave with Frequency: {frequency}')\n    plt.grid(True, alpha=0.3)\n    plt.show()\n\n# Creates an interactive slider for the frequency\ninteract(plot_func, frequency=(1.0, 10.0, 0.1));",
        "category": "notebook_snippet",
    },
    {
        "name": "Concept Check Template",
        "description": "Boilerplate for a student self-check.",
        "content": "### Concept Check\n# TODO: Answer the following question\n# What happens if you change the 'frequency' parameter above to a negative value?\n\n# [Enter your answer as a comment or markdown cell]",
        "category": "notebook_snippet",
    },
]

class PromptManager:
    """Manages custom system prompts, storing them in a SQLite database."""

    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            db_path = get_prompts_db_path()

        self.db_path = db_path

        # Two separate default prompts for local and global suggestions
        self._default_local_prompt = {
            "id": "default_local",
            "name": "Default (Local)",
            "description": "Standard prompt for contextual suggestions",
            "content": DEFAULT_SYSTEM_PROMPT,
            "category": "suggestion",
            "isDefault": True,
        }

        self._default_global_prompt = {
            "id": "default_global",
            "name": "Default (Global)",
            "description": "Standard prompt for full notebook suggestions",
            "content": DEFAULT_SYSTEM_PROMPT,
            "category": "suggestion",
            "isDefault": True,
        }

        self._default_explain_prompt = {
            "id": "default_explain",
            "name": "Explain Code",
            "description": "Explains what the selected code does in detail",
            "content": "You are a helpful coding assistant. Explain the following code in detail, breaking down what it does step by step.",
            "category": "chat",
            "isDefault": True,
        }

        self._default_refactor_prompt = {
            "id": "default_refactor",
            "name": "Refactor Code",
            "description": "Suggests refactoring the selected code for better readability and performance",
            "content": "You are a helpful coding assistant. Suggest a refactoring for the following code to improve readability, performance, and best practices. Explain the changes you made.",
            "category": "chat",
            "isDefault": True,
        }

        self._default_chat_system_prompt = {
            "id": "default_chat_system",
            "name": "Default Chat System",
            "description": "Default system prompt for the chat assistant",
            "content": "You are a helpful coding assistant.",
            "category": "chat_system_prompt",
            "isDefault": True,
        }

        self._init_db()
        self._migrate_from_json()
        self._seed_samples()

    def _init_db(self) -> None:
        """Create the prompts table if it doesn't exist."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS prompts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    description TEXT,
                    category TEXT DEFAULT 'suggestion',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )

            # Migrate schema if columns are missing
            cursor.execute("PRAGMA table_info(prompts)")
            columns = [info[1] for info in cursor.fetchall()]
            if "description" not in columns:
                cursor.execute("ALTER TABLE prompts ADD COLUMN description TEXT")
            if "category" not in columns:
                cursor.execute("ALTER TABLE prompts ADD COLUMN category TEXT DEFAULT 'suggestion'")

            # Create index on name for faster lookups
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_name
                ON prompts(name)
                """
            )

            conn.commit()

        LOGGER.info(f"[PromptManager] Initialized database at {self.db_path}")

    def _migrate_from_json(self) -> None:
        """Migrate existing custom_prompts.json data to database on first run."""
        json_path = get_custom_prompts_json_path()

        # Also check current directory for legacy files that might need migration
        current_dir_json = Path.cwd() / "custom_prompts.json"
        if not json_path.exists() and current_dir_json.exists():
            json_path = current_dir_json

        if not json_path.exists():
            return

        try:
            with open(json_path, "r", encoding="utf-8") as f:
                prompts = json.load(f)

            if not prompts:
                return

            # Check if we've already migrated by seeing if any prompts exist
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM prompts")
                count = cursor.fetchone()[0]

                if count > 0:
                    # Already migrated
                    return

                # Migrate prompts
                now = time.time()
                rows = []
                for prompt in prompts:
                    if prompt.get("id") == "default":
                        continue  # Skip default prompt

                    rows.append(
                        (
                            prompt["id"],
                            prompt["name"],
                            prompt["content"],
                            1 if prompt.get("isDefault", False) else 0,
                            prompt.get("description"),
                            prompt.get("category", "suggestion"),
                            now,
                            now,
                        )
                    )

                if rows:
                    cursor.executemany(
                        "INSERT INTO prompts (id, name, content, is_default, description, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        rows,
                    )
                    conn.commit()
                    LOGGER.info(
                        f"[PromptManager] Migrated {len(rows)} prompts from JSON to database"
                    )

                # Rename the JSON file to mark it as migrated
                backup_path = json_path.with_suffix(".json.migrated")
                json_path.rename(backup_path)
                LOGGER.info(f"[PromptManager] Renamed {json_path} to {backup_path}")

        except Exception as e:
            LOGGER.error(f"Failed to migrate prompts from JSON: {e}")

    def _seed_samples(self) -> None:
        """Seed the database with sample prompts if they don't exist."""
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            
            for sample in SAMPLE_PROMPTS:
                # Check if this sample (by name and category) already exists
                cursor.execute(
                    "SELECT id FROM prompts WHERE name = ? AND category = ?",
                    (sample["name"], sample["category"]),
                )
                if not cursor.fetchone():
                    new_id = uuid.uuid4().hex
                    cursor.execute(
                        """
                        INSERT INTO prompts (id, name, content, is_default, description, category, created_at, updated_at)
                        VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                        """,
                        (
                            new_id,
                            sample["name"],
                            sample["content"],
                            sample.get("description"),
                            sample.get("category"),
                            now,
                            now,
                        ),
                    )
            
            conn.commit()
            LOGGER.info("[PromptManager] Finished seeding/syncing sample prompts")

    def get_all_prompts(self) -> List[Dict[str, Any]]:
        """Get all prompts including the default ones."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, name, content, is_default, description, category
                FROM prompts
                ORDER BY created_at ASC
                """
            )

            custom_prompts = []
            for row in cursor.fetchall():
                custom_prompts.append(
                    {
                        "id": row[0],
                        "name": row[1],
                        "content": row[2],
                        "isDefault": bool(row[3]),
                        "description": row[4],
                        "category": row[5] or "suggestion",
                    }
                )

        # Always return both default prompts first
        return [
            self._default_local_prompt,
            self._default_global_prompt,
            self._default_explain_prompt,
            self._default_refactor_prompt,
            self._default_chat_system_prompt,
        ] + custom_prompts

    def get_prompt_by_id(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific prompt by ID."""
        if prompt_id == "default_local":
            return self._default_local_prompt
        if prompt_id == "default_global":
            return self._default_global_prompt
        if prompt_id == "default_explain":
            return self._default_explain_prompt
        if prompt_id == "default_refactor":
            return self._default_refactor_prompt
        if prompt_id == "default_chat_system":
            return self._default_chat_system_prompt
        # Legacy support for old "default" ID
        if prompt_id == "default":
            return self._default_local_prompt

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, name, content, is_default, description, category
                FROM prompts
                WHERE id = ?
                """,
                (prompt_id,),
            )

            row = cursor.fetchone()
            if row:
                return {
                    "id": row[0],
                    "name": row[1],
                    "content": row[2],
                    "isDefault": bool(row[3]),
                    "description": row[4],
                    "category": row[5] or "suggestion",
                }

        return None

    def save_prompt(
        self, name: str, content: str, prompt_id: Optional[str] = None, description: Optional[str] = None, category: str = "suggestion"
    ) -> Dict[str, Any]:
        """Create or update a custom prompt."""
        now = time.time()

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            if prompt_id:
                # Check if prompt exists
                cursor.execute("SELECT id FROM prompts WHERE id = ?", (prompt_id,))
                exists = cursor.fetchone()

                if exists:
                    # Update existing
                    cursor.execute(
                        """
                        UPDATE prompts
                        SET name = ?, content = ?, description = ?, category = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (name, content, description, category, now, prompt_id),
                    )
                    conn.commit()

                    return {
                        "id": prompt_id,
                        "name": name,
                        "content": content,
                        "description": description,
                        "category": category,
                        "isDefault": False,
                    }

            # Create new
            new_id = prompt_id or uuid.uuid4().hex
            cursor.execute(
                """
                INSERT INTO prompts (id, name, content, is_default, description, category, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                """,
                (new_id, name, content, description, category, now, now),
            )
            conn.commit()

            LOGGER.info(f"[PromptManager] Created new prompt: {new_id}")

            return {
                "id": new_id, 
                "name": name, 
                "content": content, 
                "description": description,
                "category": category,
                "isDefault": False
            }

    def delete_prompt(self, prompt_id: str) -> bool:
        """Delete a custom prompt by ID. Default prompts cannot be deleted."""
        if prompt_id in ("default_local", "default_global", "default_explain", "default_refactor", "default"):
            return False

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
            conn.commit()
            deleted = cursor.rowcount > 0

        if deleted:
            LOGGER.info(f"[PromptManager] Deleted prompt: {prompt_id}")

        return deleted
