import React, { useEffect, useState } from 'react';
import type { ITelemetryStats } from '../../telemetry/types';

export interface IDashboardViewProps {
  fetchStats: () => Promise<ITelemetryStats | null>;
}

export const DashboardView: React.FC<IDashboardViewProps> = ({
  fetchStats
}) => {
  const [stats, setStats] = useState<ITelemetryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStats();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    void loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading && !stats) {
    return (
      <div className="jp-selenepy-dashboard-container">
        <div className="jp-selenepy-dashboard-loading">
          Loading statistics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="jp-selenepy-dashboard-container">
        <div className="jp-selenepy-dashboard-error">Error: {error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="jp-selenepy-dashboard-container">
        <div className="jp-selenepy-dashboard-empty">
          No telemetry data available yet.
        </div>
      </div>
    );
  }

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) {
      return 'Just now';
    }
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}m ago`;
    }
    if (diff < 86400) {
      return `${Math.floor(diff / 3600)}h ago`;
    }
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getProductivityMessage = (score: number): string => {
    if (score >= 90) {
      return '🌟 Excellent! Keep up the great work!';
    }
    if (score >= 75) {
      return '👍 Great productivity today!';
    }
    if (score >= 60) {
      return '✨ Good progress!';
    }
    if (score >= 40) {
      return '📈 Building momentum...';
    }
    return '🚀 Just getting started!';
  };

  return (
    <div className="jp-selenepy-dashboard-container">
      <header className="jp-selenepy-dashboard-header">
        <h2>Productivity Dashboard</h2>
      </header>

      <div className="jp-selenepy-dashboard-grid">
        {/* Time Metrics */}
        <div className="jp-selenepy-dashboard-card">
          <h3>⏱️ Time Spent Editing</h3>
          <div className="jp-selenepy-dashboard-value">
            {formatDuration(stats.total_editing_time_seconds)}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            Active coding time
          </div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>🌐 Time on JupyterLab</h3>
          <div className="jp-selenepy-dashboard-value">
            {formatDuration(
              stats.total_notebook_session_seconds +
                stats.total_away_time_seconds
            )}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            Total session time
          </div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>📓 Time on Notebook</h3>
          <div className="jp-selenepy-dashboard-value">
            {formatDuration(stats.total_notebook_session_seconds)}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            Notebook visible time
          </div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>⏸️ Time Away</h3>
          <div className="jp-selenepy-dashboard-value">
            {formatDuration(stats.total_away_time_seconds)}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            {stats.times_left_tab} times left tab
          </div>
        </div>

        {/* Activity Metrics */}
        <div className="jp-selenepy-dashboard-card">
          <h3>▶️ Cells Executed</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.cells_executed}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">Total runs</div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>🗑️ Cells Deleted</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.cells_deleted}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">Removed cells</div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>📋 Paste Events</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.paste_events}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">Code pasted</div>
        </div>

        {/* LLM Metrics */}
        <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-wide">
          <h3>🤖 LLM Suggestions</h3>
          <div className="jp-selenepy-dashboard-llm-stats">
            <div className="jp-selenepy-dashboard-llm-item">
              <span className="jp-selenepy-dashboard-llm-label">Applied:</span>
              <span className="jp-selenepy-dashboard-llm-value">
                {stats.event_counts['SuggestionAppliedEvent'] || 0}
              </span>
            </div>
            <div className="jp-selenepy-dashboard-llm-item">
              <span className="jp-selenepy-dashboard-llm-label">
                Dismissed:
              </span>
              <span className="jp-selenepy-dashboard-llm-value">
                {stats.event_counts['SuggestionDismissedEvent'] || 0}
              </span>
            </div>
            <div className="jp-selenepy-dashboard-llm-item">
              <span className="jp-selenepy-dashboard-llm-label">
                Acceptance Rate:
              </span>
              <span className="jp-selenepy-dashboard-llm-value">
                {(() => {
                  const applied =
                    stats.event_counts['SuggestionAppliedEvent'] || 0;
                  const dismissed =
                    stats.event_counts['SuggestionDismissedEvent'] || 0;
                  const total = applied + dismissed;
                  return total > 0
                    ? `${Math.round((applied / total) * 100)}%`
                    : 'N/A';
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* New Metrics */}
        <div className="jp-selenepy-dashboard-card">
          <h3>➕ Cells Created</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.cells_created}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">New cells added</div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>📂 Notebooks Opened</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.notebooks_opened}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            {stats.unique_notebooks} unique files
          </div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>💾 Notebooks Saved</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.notebooks_saved}
          </div>
          <div className="jp-selenepy-dashboard-subtitle">Times saved</div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>📊 Execution Success</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.execution_success_rate.toFixed(1)}%
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            ✅ {stats.cells_executed_successfully} / ❌{' '}
            {stats.cells_executed_failed}
          </div>
        </div>

        <div className="jp-selenepy-dashboard-card">
          <h3>⏰ Time Saved by AI</h3>
          <div className="jp-selenepy-dashboard-value">
            {stats.estimated_time_saved_minutes}m
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            From {stats.suggestions_applied} applied suggestions
          </div>
        </div>

        {/* Productivity Score - Highlighted */}
        <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-wide jp-selenepy-dashboard-card-highlight">
          <h3>🎯 Productivity Score</h3>
          <div className="jp-selenepy-dashboard-value jp-selenepy-dashboard-value-large">
            {stats.productivity_score}/100
          </div>
          <div className="jp-selenepy-dashboard-subtitle">
            {getProductivityMessage(stats.productivity_score)}
          </div>
          <div className="jp-selenepy-dashboard-progress-bar">
            <div
              className="jp-selenepy-dashboard-progress-fill"
              style={{ width: `${stats.productivity_score}%` }}
            />
          </div>
        </div>

        {/* Per-Notebook Breakdown */}
        {stats.per_notebook_breakdown &&
          stats.per_notebook_breakdown.length > 0 && (
            <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-full-width">
              <h3>📊 Time Per Notebook</h3>
              <div className="jp-selenepy-dashboard-notebook-table">
                <table>
                  <thead>
                    <tr>
                      <th>Notebook</th>
                      <th>Session Time</th>
                      <th>Typing Time</th>
                      <th>Executions</th>
                      <th>Saves</th>
                      <th>Last Accessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.per_notebook_breakdown.map((notebook, idx) => (
                      <tr key={idx}>
                        <td
                          className="jp-selenepy-dashboard-notebook-name"
                          title={notebook.notebook_path}
                        >
                          {notebook.filename}
                        </td>
                        <td>{formatDuration(notebook.session_time_seconds)}</td>
                        <td>{formatDuration(notebook.typing_time_seconds)}</td>
                        <td>{notebook.executions}</td>
                        <td>{notebook.saves}</td>
                        <td>{formatRelativeTime(notebook.last_accessed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
