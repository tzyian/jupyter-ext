import React from 'react';
import type { ITelemetryStats } from '../../../telemetry/types';

export interface ILLMMetricsCardProps {
  stats: ITelemetryStats;
}

export const LLMMetricsCard: React.FC<ILLMMetricsCardProps> = ({ stats }) => {
  const applied = stats.event_counts['SuggestionAppliedEvent'] || 0;
  const dismissed = stats.event_counts['SuggestionDismissedEvent'] || 0;
  const total = applied + dismissed;
  const acceptanceRate =
    total > 0 ? `${Math.round((applied / total) * 100)}%` : 'N/A';

  return (
    <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-wide">
      <h3>🤖 LLM Suggestions</h3>
      <div className="jp-selenepy-dashboard-llm-stats">
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">Applied:</span>
          <span className="jp-selenepy-dashboard-llm-value">{applied}</span>
        </div>
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">Dismissed:</span>
          <span className="jp-selenepy-dashboard-llm-value">{dismissed}</span>
        </div>
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">
            Acceptance Rate:
          </span>
          <span className="jp-selenepy-dashboard-llm-value">
            {acceptanceRate}
          </span>
        </div>
      </div>
    </div>
  );
};
