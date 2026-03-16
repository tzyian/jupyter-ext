import React from 'react';

export interface IButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const Button: React.FC<IButtonProps> = ({
  children,
  onClick,
  disabled = false,
  variant = 'secondary',
  className = '',
  style,
  title
}) => {
  const variantClass = `jp-selenepy-button-${variant}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`jp-selenepy-button ${variantClass} ${className}`}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style
      }}
    >
      {children}
    </button>
  );
};
