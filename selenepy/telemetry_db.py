import json
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

LOGGER = logging.getLogger(__name__)


class TelemetryDB:
    """SQLite database for storing telemetry events."""

    def __init__(self, db_path: Optional[Path] = None):
        """Initialize the telemetry database.

        Args:
            db_path: Path to the SQLite database file. If None, uses .telemetry.db in the current directory.
        """
        if db_path is None:
            db_path = Path.cwd() / ".telemetry.db"

        self.db_path = db_path
        self._init_db()
        LOGGER.info(f"[TelemetryDB] Initialized database at {self.db_path}")

    def _init_db(self) -> None:
        """Create the events table if it doesn't exist."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    metadata TEXT
                )
            """
            )

            # Create index on type and timestamp for faster queries
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_type_timestamp
                ON events(type, timestamp)
            """
            )

            conn.commit()

    def insert_events(self, events: list[dict[str, Any]]) -> int:
        """Insert multiple telemetry events into the database.

        Args:
            events: List of event dictionaries with 'type', 'timestamp', and optional 'metadata'

        Returns:
            Number of events inserted
        """
        if not events:
            return 0

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            rows = [
                (
                    event["type"],
                    event["timestamp"],
                    json.dumps(event.get("metadata", {})),
                )
                for event in events
            ]

            cursor.executemany(
                "INSERT INTO events (type, timestamp, metadata) VALUES (?, ?, ?)", rows
            )

            conn.commit()
            inserted = cursor.rowcount

        LOGGER.info(f"[TelemetryDB] Inserted {inserted} events")
        return inserted

    def insert_events_batch(self, events: list[dict[str, Any]]) -> int:
        """Legacy alias for insert_events to maintain compatibility with routes.py."""
        return self.insert_events(events)

    def get_events(
        self,
        event_type: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Query events from the database.

        Args:
            event_type: Filter by event type
            start_time: Start of time range
            end_time: End of time range
            limit: Maximum number of events to return

        Returns:
            List of event dictionaries
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            query = "SELECT id, type, timestamp, metadata FROM events WHERE 1=1"
            params = []

            if event_type:
                query += " AND type = ?"
                params.append(event_type)

            if start_time:
                query += " AND timestamp >= ?"
                params.append(start_time)

            if end_time:
                query += " AND timestamp <= ?"
                params.append(end_time)

            query += " ORDER BY timestamp DESC"

            if limit:
                query += " LIMIT ?"
                params.append(limit)

            cursor.execute(query, params)

            events = []
            for row in cursor.fetchall():
                events.append(
                    {
                        "id": row[0],
                        "type": row[1],
                        "timestamp": row[2],
                        "metadata": json.loads(row[3]) if row[3] else {},
                    }
                )

        return events

    def get_event_counts(
        self, start_time: Optional[float] = None, end_time: Optional[float] = None
    ) -> dict[str, int]:
        """Get counts of events by type.

        Args:
            start_time: Start of time range
            end_time: End of time range

        Returns:
            Dictionary mapping event types to counts
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            query = "SELECT type, COUNT(*) as count FROM events WHERE 1=1"
            params = []

            if start_time:
                query += " AND timestamp >= ?"
                params.append(start_time)

            if end_time:
                query += " AND timestamp <= ?"
                params.append(end_time)

            query += " GROUP BY type"

            cursor.execute(query, params)
            counts = {row[0]: row[1] for row in cursor.fetchall()}

        return counts

    def get_summary_stats(
        self, start_time: Optional[float] = None, end_time: Optional[float] = None
    ) -> dict[str, Any]:
        """Get aggregated statistics for the dashboard.

        Args:
            start_time: Start of time range
            end_time: End of time range

        Returns:
            Dictionary with summary statistics
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()

            LOGGER.info(
                f"[TelemetryDB] Querying stats: start_time={start_time}, end_time={end_time}"
            )

            # Build time filter
            time_filter = "1=1"
            params = []
            if start_time:
                time_filter += " AND timestamp >= ?"
                params.append(start_time)
            if end_time:
                time_filter += " AND timestamp <= ?"
                params.append(end_time)

            # Count events by type
            cursor.execute(
                f"""
                SELECT type, COUNT(*) as count
                FROM events
                WHERE {time_filter}
                GROUP BY type
            """,
                params,
            )

            event_counts = {row[0]: row[1] for row in cursor.fetchall()}
            LOGGER.info(f"[TelemetryDB] Event counts: {event_counts}")

            # Calculate total editing time (sum of session durations)
            cursor.execute(
                f"""
                SELECT SUM(CAST(json_extract(metadata, '$.duration') AS REAL)) as total_duration
                FROM events
                WHERE type = 'CellEditEvent' AND {time_filter}
            """,
                params,
            )

            editing_time_result = cursor.fetchone()
            total_editing_time = editing_time_result[0] if editing_time_result[0] else 0
            LOGGER.info(f"[TelemetryDB] Total editing time: {total_editing_time:.2f}s")

            # Calculate total time away
            cursor.execute(
                f"""
                SELECT SUM(CAST(json_extract(metadata, '$.duration') AS REAL)) as total_away
                FROM events
                WHERE type = 'NotebookHiddenEvent' AND {time_filter}
            """,
                params,
            )

            away_time_result = cursor.fetchone()
            total_away_time = away_time_result[0] if away_time_result[0] else 0
            LOGGER.info(f"[TelemetryDB] Total away time: {total_away_time:.2f}s")

            # Calculate total notebook session time
            cursor.execute(
                f"""
                SELECT SUM(CAST(json_extract(metadata, '$.duration') AS REAL)) as total_session
                FROM events
                WHERE type = 'NotebookSessionEvent' AND {time_filter}
            """,
                params,
            )

            session_time_result = cursor.fetchone()
            total_notebook_session_time = (
                session_time_result[0] if session_time_result[0] else 0
            )
            LOGGER.info(
                f"[TelemetryDB] Total notebook session time: {total_notebook_session_time:.2f}s"
            )

            # Count unique notebooks
            cursor.execute(
                f"""
                SELECT COUNT(DISTINCT json_extract(metadata, '$.notebookPath'))
                FROM events
                WHERE type = 'NotebookOpenEvent' AND {time_filter}
            """,
                params,
            )

            unique_notebooks = cursor.fetchone()[0] or 0

            # Count successful executions
            cursor.execute(
                f"""
                SELECT COUNT(*)
                FROM events
                WHERE type = 'CellExecuteEvent'
                AND json_extract(metadata, '$.success') = 1
                AND {time_filter}
            """,
                params,
            )

            cells_executed_successfully = cursor.fetchone()[0] or 0

            # Count failed executions
            cursor.execute(
                f"""
                SELECT COUNT(*)
                FROM events
                WHERE type = 'CellExecuteEvent'
                AND json_extract(metadata, '$.success') = 0
                AND {time_filter}
            """,
                params,
            )

            cells_executed_failed = cursor.fetchone()[0] or 0

            # Calculate derived metrics
            total_executions = event_counts.get("CellExecuteEvent", 0)
            execution_success_rate = (
                (cells_executed_successfully / total_executions * 100)
                if total_executions > 0
                else 0
            )

            suggestions_applied = event_counts.get("SuggestionAppliedEvent", 0)
            estimated_time_saved_minutes = (
                suggestions_applied * 2
            )  # 2 min per suggestion

            # Calculate productivity score
            productivity_score = _calculate_productivity_score(
                execution_success_rate=execution_success_rate,
                editing_time_seconds=total_editing_time,
                suggestions_applied=suggestions_applied,
                suggestions_dismissed=event_counts.get("SuggestionDismissedEvent", 0),
                cells_created=event_counts.get("CellAddEvent", 0),
                notebooks_saved=event_counts.get("NotebookSaveEvent", 0),
            )

            # Get per-notebook breakdown
            per_notebook_breakdown = _get_per_notebook_breakdown(
                cursor, time_filter, params
            )

        return {
            "event_counts": event_counts,
            "total_editing_time_seconds": total_editing_time,
            "total_away_time_seconds": total_away_time,
            "total_notebook_session_seconds": total_notebook_session_time,
            # Existing simple counts
            "cells_executed": total_executions,
            "cells_deleted": event_counts.get("CellRemoveEvent", 0),
            "paste_events": event_counts.get("ClipboardPasteEvent", 0),
            "times_left_tab": event_counts.get("NotebookHiddenEvent", 0),
            # New metrics
            "cells_created": event_counts.get("CellAddEvent", 0),
            "notebooks_opened": event_counts.get("NotebookOpenEvent", 0),
            "notebooks_saved": event_counts.get("NotebookSaveEvent", 0),
            "unique_notebooks": unique_notebooks,
            "cells_executed_successfully": cells_executed_successfully,
            "cells_executed_failed": cells_executed_failed,
            "execution_success_rate": round(execution_success_rate, 1),
            "suggestions_applied": suggestions_applied,
            "suggestions_dismissed": event_counts.get("SuggestionDismissedEvent", 0),
            "estimated_time_saved_minutes": estimated_time_saved_minutes,
            "productivity_score": productivity_score,
            "per_notebook_breakdown": per_notebook_breakdown,
        }


def _calculate_productivity_score(
    execution_success_rate: float,
    editing_time_seconds: float,
    suggestions_applied: int,
    suggestions_dismissed: int,
    cells_created: int,
    notebooks_saved: int,
) -> int:
    """Calculate a productivity score from 0-100 based on multiple factors."""

    # Component 1: Execution success rate (0-30 points)
    execution_score = (execution_success_rate / 100) * 30

    # Component 2: Active coding time (0-25 points)
    # Optimal: 2-4 hours per day, diminishing returns after
    hours = editing_time_seconds / 3600
    if hours <= 0:
        time_score = 0
    elif hours <= 2:
        time_score = (hours / 2) * 25  # Linear up to 2h
    elif hours <= 4:
        time_score = 25  # Optimal range
    else:
        time_score = max(0, 25 - (hours - 4) * 2)  # Diminishing after 4h

    # Component 3: LLM acceptance rate (0-20 points)
    total_suggestions = suggestions_applied + suggestions_dismissed
    if total_suggestions > 0:
        acceptance_rate = suggestions_applied / total_suggestions
        llm_score = acceptance_rate * 20
    else:
        llm_score = 10  # Neutral if no suggestions yet

    # Component 4: Cells created (0-15 points)
    # Diminishing returns: sqrt scale
    cells_score = min(15, (cells_created**0.5) * 3)

    # Component 5: Notebooks saved (0-10 points)
    save_score = min(10, notebooks_saved * 2)

    total_score = execution_score + time_score + llm_score + cells_score + save_score

    return round(min(100, max(0, total_score)))


def _get_per_notebook_breakdown(
    cursor, time_filter: str, params: list
) -> list[dict[str, Any]]:
    """Get detailed time breakdown per notebook file."""

    # Get session time per notebook
    cursor.execute(
        f"""
        SELECT
            json_extract(metadata, '$.notebookPath') as notebook_path,
            SUM(CAST(json_extract(metadata, '$.duration') AS REAL)) as session_time,
            MAX(timestamp) as last_accessed
        FROM events
        WHERE type = 'NotebookSessionEvent'
        AND json_extract(metadata, '$.notebookPath') IS NOT NULL
        AND {time_filter}
        GROUP BY notebook_path
        ORDER BY session_time DESC
    """,
        params,
    )

    notebook_stats = []
    for row in cursor.fetchall():
        notebook_path = row[0]
        session_time = row[1] or 0
        last_accessed = row[2] or 0

        # Get typing time for this notebook
        cursor.execute(
            f"""
            SELECT SUM(CAST(json_extract(metadata, '$.duration') AS REAL))
            FROM events
            WHERE type = 'CellEditEvent'
            AND json_extract(metadata, '$.notebookPath') = ?
            AND {time_filter}
        """,
            [notebook_path] + params,
        )

        typing_time_result = cursor.fetchone()
        typing_time = typing_time_result[0] if typing_time_result[0] else 0

        # Get execution count for this notebook
        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM events
            WHERE type = 'CellExecuteEvent'
            AND json_extract(metadata, '$.notebookPath') = ?
            AND {time_filter}
        """,
            [notebook_path] + params,
        )

        executions = cursor.fetchone()[0] or 0

        # Get save count for this notebook
        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM events
            WHERE type = 'NotebookSaveEvent'
            AND json_extract(metadata, '$.notebookPath') = ?
            AND {time_filter}
        """,
            [notebook_path] + params,
        )

        saves = cursor.fetchone()[0] or 0

        # Extract just the filename from the path
        filename = os.path.basename(notebook_path) if notebook_path else "Unknown"

        notebook_stats.append(
            {
                "notebook_path": notebook_path,
                "filename": filename,
                "session_time_seconds": round(session_time, 1),
                "typing_time_seconds": round(typing_time, 1),
                "executions": executions,
                "saves": saves,
                "last_accessed": last_accessed,
            }
        )

    return notebook_stats
