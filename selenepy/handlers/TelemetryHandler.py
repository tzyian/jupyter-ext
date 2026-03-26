import tornado
from jupyter_server.base.handlers import APIHandler

from selenepy.db.telemetry_db import TelemetryDB
from selenepy.utils.logging import get_logger
from selenepy.utils.utils import handle_exceptions

LOGGER = get_logger(__name__)


class TelemetryHandler(APIHandler):
    """Handler for telemetry event logging and statistics retrieval."""

    def initialize(self, db: TelemetryDB):
        """Initialize with telemetry database instance."""
        self.db = db

    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        """Receive and store telemetry events from the frontend."""
        body = self.get_json_body() or {}
        events = body.get("events", [])

        LOGGER.info(f"[Telemetry] Received {len(events)} events from frontend")

        if not events:
            self.set_status(400)
            self.finish({"error": "No events provided"})
            return

        count = self.db.insert_events(events)
        LOGGER.info(f"[Telemetry] Successfully inserted {count} events into database")
        self.finish({"inserted": count})

    @tornado.web.authenticated
    @handle_exceptions
    def get(self) -> None:
        """Retrieve aggregated telemetry statistics for the dashboard."""
        start_time = self.get_argument("start_time", None)
        end_time = self.get_argument("end_time", None)
        notebook_path = self.get_argument("notebook_path", None)

        LOGGER.info(
            f"[Telemetry] Stats request: start_time={start_time}, end_time={end_time}, notebook_path={notebook_path}"
        )

        start_float = float(start_time) if start_time else None
        end_float = float(end_time) if end_time else None

        stats = self.db.get_summary_stats(start_float, end_float, notebook_path)

        LOGGER.info(
            f"[Telemetry] Stats result: {stats.get('event_counts', {})}, "
            f"editing_time={stats.get('total_editing_time_seconds', 0):.2f}s, "
            f"away_time={stats.get('total_away_time_seconds', 0):.2f}s"
        )

        self.finish(stats)


class TelemetryRenameHandler(APIHandler):
    """Handler for migrating telemetry data when a notebook is renamed."""

    def initialize(self, db: TelemetryDB):
        """Initialize with telemetry database instance."""
        self.db = db

    @tornado.web.authenticated
    @handle_exceptions
    def post(self) -> None:
        """Handle notebook rename operation."""
        body = self.get_json_body() or {}
        old_path = body.get("old_path")
        new_path = body.get("new_path")

        if not old_path or not new_path:
            self.set_status(400)
            self.finish({"error": "old_path and new_path are required"})
            return

        LOGGER.info(f"[Telemetry] Rename request: {old_path} -> {new_path}")

        count = self.db.migrate_notebook_path(old_path, new_path)

        self.finish({"migrated_events": count})
