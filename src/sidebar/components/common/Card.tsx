import React from 'react';

export interface ICardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  headerActions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Card: React.FC<ICardProps> = ({
  children,
  title,
  className = '',
  headerActions,
  style
}) => {
  return (
    <div className={`jp-selenepy-card ${className}`} style={style}>
      {(title || headerActions) && (
        <div className="jp-selenepy-card-header">
          {title && <h3>{title}</h3>}
          {headerActions && (
            <div className="jp-selenepy-card-header-actions">
              {headerActions}
            </div>
          )}
        </div>
      )}
      <div className="jp-selenepy-card-body">{children}</div>
    </div>
  );
};
