import React from 'react';
import type { ITelemetryStats } from '../../telemetry/types';
import { DashboardMetricCard } from './dashboard/DashboardMetricCard';
import { LLMMetricsCard } from './dashboard/LLMMetricsCard';
import { ProductivityCard } from './dashboard/ProductivityCard';
import { NotebookTableCard } from './dashboard/NotebookTableCard';
import { formatDuration } from '../../utils/formatting';
import { useTelemetryStats } from '../utils/useTelemetryStats';

export interface IDashboardViewProps {
  fetchStats: (notebookPath?: string) => Promise<ITelemetryStats | null>;
}

export const DashboardView: React.FC<IDashboardViewProps> = ({
  fetchStats
}) => {
  const { stats, loading, error, selectedNotebook, setSelectedNotebook } =
    useTelemetryStats(fetchStats);

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

  return (
    <div className="jp-selenepy-dashboard-container">
      <header className="jp-selenepy-dashboard-header">
        <h2>Productivity Dashboard</h2>
        <div className="jp-selenepy-dashboard-controls">
          <select
            className="jp-selenepy-toggle-button jp-selenepy-dashboard-select"
            value={selectedNotebook}
            onChange={e => setSelectedNotebook(e.target.value)}
            style={{ width: '100%', maxWidth: '200px', cursor: 'pointer' }}
          >
            <option value="">(Global) All Notebooks</option>
            {stats?.available_notebooks?.map(nb => (
              <option key={nb.path} value={nb.path}>
                {nb.filename}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="jp-selenepy-dashboard-grid">
        {stats.per_notebook_breakdown && (
          <NotebookTableCard notebooks={stats.per_notebook_breakdown} />
        )}

        {/* Time Metrics */}
        <DashboardMetricCard
          title="⏱️ Time Spent Editing"
          value={formatDuration(stats.total_editing_time_seconds)}
          subtitle="Active coding time"
        />
        <DashboardMetricCard
          title="🌐 Time on JupyterLab"
          value={formatDuration(
            stats.total_notebook_session_seconds + stats.total_away_time_seconds
          )}
          subtitle="Total session time"
        />
        <DashboardMetricCard
          title="📓 Time on Notebook"
          value={formatDuration(stats.total_notebook_session_seconds)}
          subtitle="Notebook visible time"
        />
        <DashboardMetricCard
          title="⏸️ Time Away"
          value={formatDuration(stats.total_away_time_seconds)}
          subtitle={`${stats.times_left_tab} times left tab`}
        />

        {/* Activity Metrics */}
        <DashboardMetricCard
          title="▶️ Cells Executed"
          value={stats.cells_executed}
          subtitle="Total runs"
        />
        <DashboardMetricCard
          title="🗑️ Cells Deleted"
          value={stats.cells_deleted}
          subtitle="Removed cells"
        />
        <DashboardMetricCard
          title="📋 Paste Events"
          value={stats.paste_events}
          subtitle="Code pasted"
        />

        <LLMMetricsCard stats={stats} />

        <DashboardMetricCard
          title="➕ Cells Created"
          value={stats.cells_created}
          subtitle="New cells added"
        />
        <DashboardMetricCard
          title="📂 Notebooks Opened"
          value={stats.notebooks_opened}
          subtitle={`${stats.unique_notebooks} unique files`}
        />
        <DashboardMetricCard
          title="💾 Notebooks Saved"
          value={stats.notebooks_saved}
          subtitle="Times saved"
        />
        <DashboardMetricCard
          title="📊 Execution Success"
          value={`${stats.execution_success_rate.toFixed(1)}%`}
          subtitle={`✅ ${stats.cells_executed_successfully} / ❌ ${stats.cells_executed_failed}`}
        />
        <DashboardMetricCard
          title="⏰ Time Saved by AI"
          value={`${stats.estimated_time_saved_minutes}m`}
          subtitle={`From ${stats.suggestions_applied} applied suggestions`}
        />

        <ProductivityCard score={stats.productivity_score} />
      </div>
    </div>
  );
};
