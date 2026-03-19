import sqlite3
import time
import uuid
from pathlib import Path
from typing import Optional

from .logging import get_logger

LOGGER = get_logger(__name__)


class ChatDB:
    """SQLite database for storing chat threads and messages."""

    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            db_path = Path.cwd() / ".chat.db"
        self.db_path = db_path
        self._init_db()
        LOGGER.info("[ChatDB] Initialized database at %s", self.db_path)

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_threads (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            # Add last_response_duration column if it doesn't exist
            try:
                conn.execute(
                    "ALTER TABLE chat_threads ADD COLUMN last_response_duration REAL"
                )
            except sqlite3.OperationalError:
                # Column already exists
                pass
            conn.commit()

    # ------------------------------------------------------------------
    # Thread operations
    # ------------------------------------------------------------------

    def create_thread(self, title: str = "New Chat") -> dict:
        """Create a new thread and return its record."""
        thread_id = str(uuid.uuid4())
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO chat_threads (id, title, created_at, updated_at, last_response_duration)"
                " VALUES (?, ?, ?, ?, ?)",
                (thread_id, title, now, now, None),
            )
            conn.commit()
        return {
            "id": thread_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
            "last_response_duration": None,
        }

    def list_threads(self) -> list:
        """Return all threads ordered newest-first, with message counts."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, title, created_at, updated_at, last_response_duration,
                       0 AS message_count
                FROM chat_threads
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def rename_thread(self, thread_id: str, title: str) -> bool:
        """Rename a thread. Returns True if a row was updated."""
        return self.update_thread(thread_id, title=title)

    def update_thread(self, thread_id: str, **kwargs) -> bool:
        """Update arbitrary thread fields. Returns True if a row was updated."""
        if not kwargs:
            return False

        fields = []
        values = []
        for k, v in kwargs.items():
            fields.append(f"{k} = ?")
            values.append(v)

        values.append(time.time())  # updated_at
        values.append(thread_id)

        query = (
            f"UPDATE chat_threads SET {', '.join(fields)}, updated_at = ? WHERE id = ?"
        )

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(query, tuple(values))
            conn.commit()
        return cursor.rowcount > 0

    def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread and its messages (via CASCADE). Returns True on success."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            cursor = conn.execute("DELETE FROM chat_threads WHERE id = ?", (thread_id,))
            conn.commit()
        return cursor.rowcount > 0

    def thread_exists(self, thread_id: str) -> bool:
        """Check whether a thread ID is present in the database."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT 1 FROM chat_threads WHERE id = ?", (thread_id,)
            ).fetchone()
        return row is not None

    # ------------------------------------------------------------------
    # Message operations
    # ------------------------------------------------------------------

    def touch_thread(self, thread_id: str) -> bool:
        """Bump the updated_at timestamp for a thread. Returns True if updated."""
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "UPDATE chat_threads SET updated_at = ? WHERE id = ?",
                (now, thread_id),
            )
            conn.commit()
        return cursor.rowcount > 0
