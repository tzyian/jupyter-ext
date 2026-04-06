import { IDisposable } from '@lumino/disposable';
import type { SuggestedEditsSidebar } from '../sidebar/suggestions/SuggestedEditsSidebar';
import type { IResolvedSuggestion } from '../sidebar/suggestions/types';
import type { TelemetryService } from './telemetryService';

/**
 * Tracks sidebar interaction telemetry events.
 */
export class SidebarTelemetryTracker implements IDisposable {
  private _disposed = false;

  constructor(
    private readonly _sidebar: SuggestedEditsSidebar,
    private readonly _telemetry: TelemetryService
  ) {
    // Track refresh requests
    this._sidebar.refreshContextRequested.connect(this._onRefreshContext, this);
    this._sidebar.refreshFullRequested.connect(this._onRefreshFull, this);

    // Track suggestion outcomes
    this._sidebar.applyRequested.connect(this._onApply, this);
    this._sidebar.dismissRequested.connect(this._onDismiss, this);

    // Track pause/resume
    this._sidebar.pauseRequested.connect(this._onPauseToggle, this);
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    this._sidebar.refreshContextRequested.disconnect(
      this._onRefreshContext,
      this
    );
    this._sidebar.refreshFullRequested.disconnect(this._onRefreshFull, this);
    this._sidebar.applyRequested.disconnect(this._onApply, this);
    this._sidebar.dismissRequested.disconnect(this._onDismiss, this);
    this._sidebar.pauseRequested.disconnect(this._onPauseToggle, this);
  }

  private _onRefreshContext = (): void => {
    this._telemetry.logEvent('SuggestionRefreshEvent', {
      mode: 'context'
    });
  };

  private _onRefreshFull = (): void => {
    this._telemetry.logEvent('SuggestionRefreshEvent', {
      mode: 'full'
    });
  };

  private _onApply = (
    _: SuggestedEditsSidebar,
    suggestion: IResolvedSuggestion
  ): void => {
    this._telemetry.logEvent('SuggestionAppliedEvent', {
      cellIndex: suggestion.cellIndex,
      contextType: suggestion.contextType,
      notebookPath: suggestion.notebookPath
    });
  };

  private _onDismiss = (
    _: SuggestedEditsSidebar,
    suggestion: IResolvedSuggestion
  ): void => {
    this._telemetry.logEvent('SuggestionDismissedEvent', {
      cellIndex: suggestion.cellIndex,
      contextType: suggestion.contextType,
      notebookPath: suggestion.notebookPath
    });
  };

  private _onPauseToggle = (): void => {
    this._telemetry.logEvent('SuggestionPauseToggleEvent', {});
  };
}
