import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import type { TelemetryService } from '../../telemetry/telemetryService';
import { DashboardView } from './components/DashboardView';
import { TELEMETRY_SIDEBAR_ID } from '../../types';

/**
 * Sidebar widget for displaying telemetry dashboard.
 */
export class TelemetrySidebar extends ReactWidget {
  constructor(private readonly _telemetryService: TelemetryService) {
    super();
    this.id = TELEMETRY_SIDEBAR_ID;
    this.addClass('jp-selenepy-telemetry');
    this.title.label = 'Dashboard';
    this.title.caption = 'Productivity Dashboard';
    this.title.iconClass = 'jp-SpreadsheetIcon';
  }

  protected render(): JSX.Element {
    return (
      <DashboardView
        fetchStats={notebookPath =>
          this._telemetryService.getStats(undefined, undefined, notebookPath)
        }
      />
    );
  }
}
