import React from 'react';
import { Select } from './Select';

export interface ISidebarLayoutProps {
  view: string;
  onViewChange: (view: string) => void;
  options: { value: string; label: string }[];
  children: React.ReactNode;
}

/**
 * A generic layout structure for sidebars that have a view selector at the top.
 */
export const SidebarLayout: React.FC<ISidebarLayoutProps> = ({
  view,
  onViewChange,
  options,
  children
}) => {
  return (
    <div className="jp-selenepy-sidebar-wrapper">
      <div className="jp-selenepy-sidebar-header-row">
        <Select
          label="View:"
          value={view}
          onChange={onViewChange}
          options={options}
          className="jp-selenepy-select-inline"
        />
      </div>
      <div className="jp-selenepy-sidebar-content">{children}</div>
    </div>
  );
};
