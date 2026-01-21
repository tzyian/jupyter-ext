import { IDisposable } from '@lumino/disposable';
import type { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import type {
  INotebookSnapshot,
  IResolvedSuggestion,
  ISuggestion,
  ISuggestedEditsSettings,
  SuggestionScanMode,
  SuggestionStreamEvent,
  INotebookCellSnapshot
} from '../types';
import { SuggestedEditsSidebar } from './suggestedEditsPanel';
import { streamSuggestions } from './api';
import { buildSnapshot } from './utils/snapshot';
import { buildDiffSegments } from './utils/diff';
import { INotebookSignals, NotebookSignalGroup } from './utils/notebookSignals';

/**
 * Controller for the suggested edits sidebar.
 * Orchestrates notebook tracking, suggestion streaming, and UI updates.
 */
export class SuggestedEditsController implements IDisposable {
  constructor(
    private readonly _tracker: INotebookTracker,
    private readonly _panel: SuggestedEditsSidebar,
    private _settings: ISuggestedEditsSettings
  ) {
    this._panel.refreshContextRequested.connect(
      this.handleContextRefresh,
      this
    );
    this._panel.refreshFullRequested.connect(this.handleFullRefresh, this);
    this._panel.applyRequested.connect(this.handleApply, this);
    this._panel.pauseRequested.connect(this.handlePauseToggle, this);

    this._tracker.currentChanged.connect(this.handleNotebookChanged, this);
    if (this._tracker.currentWidget) {
      this.attachNotebook(this._tracker.currentWidget);
    }
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._disposed = true;

    this.clearNotebook();
    this._panel.refreshContextRequested.disconnect(
      this.handleContextRefresh,
      this
    );
    this._panel.refreshFullRequested.disconnect(this.handleFullRefresh, this);
    this._panel.applyRequested.disconnect(this.handleApply, this);
    this._panel.pauseRequested.disconnect(this.handlePauseToggle, this);
    this._tracker.currentChanged.disconnect(this.handleNotebookChanged, this);
    this.cancelPendingStream();
  }

  updateSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    if (!settings.autoRefresh) {
      this.cancelPendingStream();
      this._panel.showIdle();
    } else {
      this.scheduleRefresh();
    }
  }

  private handleNotebookChanged(
    _: INotebookTracker,
    panel: NotebookPanel | null
  ): void {
    this.clearNotebook();
    if (!panel) {
      this._panel.showIdle();
      return;
    }
    this.attachNotebook(panel);
    this.scheduleRefresh();
  }

  private attachNotebook(panel: NotebookPanel): void {
    const signals = new NotebookSignalGroup(panel, () => {
      if (this._settings.autoRefresh) {
        this.scheduleRefresh();
      }
    });
    this._notebookSignals = signals;
  }

  private clearNotebook(): void {
    if (this._notebookSignals) {
      this._notebookSignals.dispose();
      this._notebookSignals = null;
    }
    this.cancelPendingStream();
  }

  private scheduleRefresh(): void {
    if (!this._notebookSignals || this._isPaused) {
      return;
    }

    if (this._debounceId) {
      window.clearTimeout(this._debounceId);
    }

    this._debounceId = window.setTimeout(() => {
      void this.refresh('context');
    }, this._settings.debounceMs);
  }

  async refresh(mode: SuggestionScanMode = 'context'): Promise<void> {
    if (!this._notebookSignals || this._isPaused) {
      this._panel.showIdle();
      return;
    }

    const { panel } = this._notebookSignals;
    const snapshot = buildSnapshot(panel, this._settings.maxCellCharacters);
    this._lastSnapshot = snapshot;
    this.cancelPendingStream();
    this._activeMode = mode;
    this._panel.showLoading(this.loadingMessageForMode());

    const controller = new AbortController();
    this._currentAbort = controller;

    try {
      for await (const event of streamSuggestions(
        snapshot,
        this._settings,
        mode,
        controller.signal
      )) {
        this.processStreamEvent(event);
      }
      this._panel.showComplete(this._activeMode);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._panel.showError(`Failed to update suggestions: ${message}`);
    } finally {
      if (this._currentAbort === controller) {
        this._currentAbort = null;
      }
    }
  }

  private processStreamEvent(event: SuggestionStreamEvent): void {
    switch (event.type) {
      case 'status':
        if (event.phase === 'started') {
          this._panel.showLoading(this.loadingMessageForMode());
          if (this._activeMode === 'full') {
            this._panel.beginGlobalStream();
          } else {
            this._panel.beginLocalStream();
          }
        }
        break;
      case 'suggestion':
        this.handleSuggestionEvent(event.payload);
        break;
      case 'info':
        this._panel.setStatus(event.message);
        break;
      default:
        break;
    }
  }

  private handleSuggestionEvent(
    payload: ISuggestion | IResolvedSuggestion
  ): void {
    const suggestion = this.ensureResolvedSuggestion(payload);
    if (suggestion.contextType === 'global') {
      this._panel.setGlobalSuggestion(suggestion);
    } else {
      this._panel.pushLocalSuggestion(suggestion);
    }
  }

  private handleApply(
    _: SuggestedEditsSidebar,
    suggestion: IResolvedSuggestion
  ): void {
    const panel = this._notebookSignals?.panel;
    if (!panel || panel.isDisposed) {
      this._panel.showError('Notebook is no longer available.');
      return;
    }

    const widgets = panel.content.widgets;
    if (suggestion.cellIndex < 0 || suggestion.cellIndex >= widgets.length) {
      this._panel.showError('Suggested cell index is out of range.');
      return;
    }

    const cell = widgets[suggestion.cellIndex];
    const shared = cell.model.sharedModel;
    const normalized = suggestion.replacementSource ?? '';

    shared.transact(() => {
      shared.setSource(normalized);
    });
  }

  private cancelPendingStream(): void {
    if (this._debounceId) {
      window.clearTimeout(this._debounceId);
      this._debounceId = null;
    }
    if (this._currentAbort) {
      this._currentAbort.abort();
      this._currentAbort = null;
    }
  }

  private handleContextRefresh(_: SuggestedEditsSidebar, __: void): void {
    void this.refresh('context');
  }

  private handleFullRefresh(_: SuggestedEditsSidebar, __: void): void {
    void this.refresh('full');
  }

  private handlePauseToggle(_: SuggestedEditsSidebar, __: void): void {
    this._isPaused = !this._isPaused;

    if (this._isPaused) {
      this.cancelPendingStream();
      this._panel.setStatus('Paused.');
    } else {
      void this.refresh('context');
    }

    this._panel.setPaused(this._isPaused);
  }

  private ensureResolvedSuggestion(
    suggestion: ISuggestion | IResolvedSuggestion
  ): IResolvedSuggestion {
    if ('diffSegments' in suggestion && 'originalSource' in suggestion) {
      return {
        ...suggestion,
        contextType: suggestion.contextType ?? 'local'
      };
    }

    const original = this.lookupOriginalSource(suggestion.cellIndex);
    return {
      ...suggestion,
      originalSource: original,
      diffSegments: buildDiffSegments(original, suggestion.replacementSource),
      contextType: suggestion.contextType ?? 'local'
    };
  }

  private lookupOriginalSource(index: number): string {
    const snapshot = this._lastSnapshot;
    if (!snapshot) {
      return '';
    }
    const cell = snapshot.cells.find(
      (entry: INotebookCellSnapshot) => entry.index === index
    );
    return cell?.source ?? '';
  }

  private loadingMessageForMode(): string {
    return this._activeMode === 'full'
      ? 'Scanning entire notebook for suggestions…'
      : 'Streaming contextual suggestions…';
  }

  private _notebookSignals: INotebookSignals | null = null;
  private _debounceId: number | null = null;
  private _currentAbort: AbortController | null = null;
  private _lastSnapshot: INotebookSnapshot | null = null;
  private _activeMode: SuggestionScanMode = 'context';
  private _isPaused = false;
  private _disposed = false;
}
