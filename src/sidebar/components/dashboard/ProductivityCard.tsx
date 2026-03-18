import React from 'react';

export interface IProductivityCardProps {
  score: number;
}

export const ProductivityCard: React.FC<IProductivityCardProps> = ({
  score
}) => {
  const getProductivityMessage = (val: number): string => {
    if (val >= 90) {
      return '🌟 Excellent! Keep up the great work!';
    }
    if (val >= 75) {
      return '👍 Great productivity today!';
    }
    if (val >= 60) {
      return '✨ Good progress!';
    }
    if (val >= 40) {
      return '📈 Building momentum...';
    }
    return '🚀 Just getting started!';
  };

  return (
    <div className="jp-selenepy-dashboard-card jp-selenepy-dashboard-card-wide jp-selenepy-dashboard-card-highlight">
      <h3>🎯 Productivity Score</h3>
      <div className="jp-selenepy-dashboard-value jp-selenepy-dashboard-value-large">
        {score}/100
      </div>
      <div className="jp-selenepy-dashboard-subtitle">
        {getProductivityMessage(score)}
      </div>
      <div className="jp-selenepy-dashboard-progress-bar">
        <div
          className="jp-selenepy-dashboard-progress-fill"
          style={{ '--productivity-score': `${score}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
};
