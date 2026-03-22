import React from 'react';

export interface ISelectOption {
  value: string;
  label: string;
}

export interface ISelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ISelectOption[];
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  hideLabel?: boolean;
}

export const Select: React.FC<ISelectProps> = ({
  label,
  value,
  onChange,
  options,
  className = '',
  style,
  hideLabel = false
}) => {
  return (
    <div className={`jp-selenepy-select-container ${className}`} style={style}>
      {label && !hideLabel && (
        <label className="jp-selenepy-select-label">{label}</label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="jp-selenepy-select-input"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
