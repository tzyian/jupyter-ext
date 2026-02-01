import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import { DashboardView } from './components/DashboardView';
import type { TelemetryService } from '../telemetry/telemetryService';

/**
 * Sidebar widget for displaying telemetry dashboard.
 */
export class TelemetrySidebar extends ReactWidget {
  constructor(private readonly _telemetryService: TelemetryService) {
    super();
    this.id = 'selenejs-telemetry-sidebar';
    this.addClass('jp-selenepy-telemetry');
  }

  protected render(): JSX.Element {
    return (
      <DashboardView
        fetchStats={() => this._telemetryService.getStats()}
      />
    );
  }
}
