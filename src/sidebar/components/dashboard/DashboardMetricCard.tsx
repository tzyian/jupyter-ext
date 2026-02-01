import React from 'react';

export interface IDashboardMetricCardProps {
  title: string;
  value: string | number;
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
      <div className="jp-selenepy-dashboard-value">{value}</div>
      <div className="jp-selenepy-dashboard-subtitle">{subtitle}</div>
    </div>
  );
};
