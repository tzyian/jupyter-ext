import React from 'react';
import type { INotebookBreakdown } from '../../../telemetry/types';
import { formatDuration, formatRelativeTime } from '../../../utils/formatting';

export interface INotebookTableCardProps {
  notebooks: INotebookBreakdown[];
}

export const NotebookTableCard: React.FC<INotebookTableCardProps> = ({
  notebooks
}) => {
  if (!notebooks || notebooks.length === 0) {
    return null;
  }

  return (
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
            {notebooks.map((notebook, idx) => (
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
  );
};
