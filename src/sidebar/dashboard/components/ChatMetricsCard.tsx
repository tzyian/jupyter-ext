import React from 'react';
import type { ITelemetryStats } from '../../../telemetry/types';

export interface IChatMetricsCardProps {
  stats: ITelemetryStats;
}

export const ChatMetricsCard: React.FC<IChatMetricsCardProps> = ({ stats }) => {
  const messagesSent = stats.chat_messages_sent || 0;
  const threadsCreated = stats.chat_threads_created || 0;
  const avgResponse = stats.chat_avg_response_seconds || 0;

  return (
    <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-wide">
      <h3>💬 Chat Interactions</h3>
      <div className="jp-selenepy-dashboard-llm-stats">
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">
            Messages Sent:
          </span>
          <span className="jp-selenepy-dashboard-llm-value">
            {messagesSent}
          </span>
        </div>
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">
            Conversations:
          </span>
          <span className="jp-selenepy-dashboard-llm-value">
            {threadsCreated}
          </span>
        </div>
        <div className="jp-selenepy-dashboard-llm-item">
          <span className="jp-selenepy-dashboard-llm-label">
            Avg. AI Speed:
          </span>
          <span className="jp-selenepy-dashboard-llm-value">
            {avgResponse > 0 ? `${avgResponse.toFixed(1)}s` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};
