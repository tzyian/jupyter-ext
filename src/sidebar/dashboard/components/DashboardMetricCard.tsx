import React from 'react';

export interface IDashboardMetricCardProps {
  title: string;
  value: string | number | undefined;
  subtitle: React.ReactNode;
  className?: string;
}

export const DashboardMetricCard: React.FC<IDashboardMetricCardProps> = ({
  title,
  value,
  subtitle,
  className = ''
}) => {
  return (
    <div className={`jp-selenepy-dashboard-card ${className}`}>
      <h3>{title}</h3>
      {value === undefined ? (
        <div className="jp-selenepy-dashboard-value">No data available</div>
      ) : (
        <div className="jp-selenepy-dashboard-value">{value}</div>
      )}
      <div className="jp-selenepy-dashboard-subtitle">{subtitle}</div>
    </div>
  );
};
