/**
 * Telemetry event types matching the backend schema.
 */
export interface ITelemetryEvent {
  type: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Dashboard statistics from the backend.
 */
export interface ITelemetryStats {
  // Overall counts keyed by event name
  event_counts?: Record<string, number>;

  // Aggregate durations (seconds)
  total_editing_time_seconds?: number;
  total_away_time_seconds?: number;
  total_notebook_session_seconds?: number;

  // Common counters
  cells_executed?: number;
  cells_deleted?: number;
  paste_events?: number;
  times_left_tab?: number;

  // Additional metrics (ptional / future-proofed)
  cells_created?: number;
  notebooks_opened?: number;
  notebooks_saved?: number;
  unique_notebooks?: number;
  cells_executed_successfully?: number;
  cells_executed_failed?: number;
  execution_success_rate?: number; // 0..1
  suggestions_applied?: number;
  suggestions_dismissed?: number;
  estimated_time_saved_minutes?: number;
  productivity_score?: number;

  // Per-notebook breakdown and available notebook metadata
  per_notebook_breakdown?: INotebookBreakdown[];
  available_notebooks?: Array<{ path: string; filename: string }>;
}

/**
 * Per-notebook breakdown statistics.
 */
export interface INotebookBreakdown {
  notebook_path: string;
  filename: string;
  session_time_seconds: number;
  typing_time_seconds: number;
  executions: number;
  saves: number;
  last_accessed: number;
}
