import { IDisposable } from '@lumino/disposable';
import { Debouncer } from '@lumino/polling';
import type { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import type {
  INotebookSnapshot,
  ISuggestedEditsSettings,
  SuggestionScanMode,
  INotebookCellSnapshot
} from '../types';
import type {
  IResolvedSuggestion,
  ISuggestion,
  SuggestionStreamEvent
} from './types';
import { SuggestedEditsSidebar } from './SuggestedEditsSidebar';
import { streamSuggestions } from '../api';
import { buildSnapshot } from '../utils/snapshot';
import { buildDiffSegments } from '../utils/diff';
import {
  INotebookSignals,
  NotebookSignalGroup
} from '../../telemetry/notebookSignals';
import { ISuggestedEditsState } from './types';

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
    this._panel.dismissRequested.connect(this.onDismissRequested, this);
    this._panel.viewChanged.connect(this.onViewChanged, this);
    this._panel.promptSelected.connect(this.onPromptSelected, this);

    this._tracker.currentChanged.connect(this.handleNotebookChanged, this);
    if (this._tracker.currentWidget) {
      this.attachNotebook(this._tracker.currentWidget);
    }

    this._debouncer = new Debouncer(() => {
      void this.refresh('context');
    }, this._settings.debounceMs);

    // Sync initial state to sidebar
    this._panel.setState(this._state);
  }

  get state(): ISuggestedEditsState {
    return this._state;
  }

  private updateState(partial: Partial<ISuggestedEditsState>): void {
    this._state = { ...this._state, ...partial };
    this._panel.setState(this._state);
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
    this._panel.dismissRequested.disconnect(this.onDismissRequested, this);
    this._panel.viewChanged.disconnect(this.onViewChanged, this);
    this._panel.promptSelected.disconnect(this.onPromptSelected, this);
    this._tracker.currentChanged.disconnect(this.handleNotebookChanged, this);
    this.cancelPendingStream();
    this._debouncer.dispose();
  }

  updateSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    if (!settings.autoRefresh) {
      this.cancelPendingStream();
      this.showIdle();
    } else {
      void this._debouncer.invoke();
    }
    this.updateState({ hasApiKey: !!settings.openaiApiKey });
  }

  private showIdle(): void {
    this.updateState({
      localSuggestions: [null, null],
      globalSuggestion: null,
      status: 'Waiting for notebook activity.'
    });
  }

  private handleNotebookChanged(
    _: INotebookTracker,
    panel: NotebookPanel | null
  ): void {
    this.clearNotebook();
    if (!panel) {
      this.showIdle();
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
    void this._debouncer.stop();
  }

  private scheduleRefresh(): void {
    if (!this._notebookSignals || this._isPaused) {
      return;
    }
    void this._debouncer.invoke();
  }

  async refresh(mode: SuggestionScanMode = 'context'): Promise<void> {
    if (!this._notebookSignals || this._isPaused) {
      this.showIdle();
      return;
    }

    const { panel } = this._notebookSignals;
    const snapshot = buildSnapshot(panel, this._settings.maxCellCharacters);
    this._lastSnapshot = snapshot;
    this.cancelPendingStream();
    this._activeMode = mode;
    this.updateState({ status: this.loadingMessageForMode() });

    const controller = new AbortController();
    this._currentAbort = controller;

    const promptId =
      mode === 'full'
        ? this._state.selectedGlobalPromptId
        : this._state.selectedLocalPromptId;

    if (mode === 'full') {
      this.updateState({ globalSuggestion: null });
    }

    try {
      for await (const event of streamSuggestions(
        snapshot,
        this._settings,
        mode,
        promptId,
        controller.signal
      )) {
        this.processStreamEvent(event);
      }
      this.showComplete(this._activeMode);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.updateState({ status: `Failed to update suggestions: ${message}` });
    } finally {
      if (this._currentAbort === controller) {
        this._currentAbort = null;
      }
    }
  }

  private showComplete(mode: SuggestionScanMode): void {
    if (mode === 'full') {
      const status = this._state.globalSuggestion
        ? 'Global suggestion ready.'
        : 'No global suggestions found.';
      this.updateState({ status });
    } else {
      const status = this._state.localSuggestions.some(s => s !== null)
        ? 'Latest suggestions ready.'
        : 'No new local suggestions.';
      this.updateState({ status });
    }
  }

  private processStreamEvent(event: SuggestionStreamEvent): void {
    switch (event.type) {
      case 'status':
        if (event.phase === 'started') {
          this.updateState({ status: this.loadingMessageForMode() });
        }
        break;
      case 'suggestion':
        this.handleSuggestionEvent(event.payload);
        break;
      case 'info':
        this.updateState({ status: event.message });
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
      this.updateState({ globalSuggestion: suggestion });
    } else {
      const local = [...this._state.localSuggestions];
      local[1] = local[0];
      local[0] = suggestion;
      this.updateState({ localSuggestions: local });
    }
  }

  private handleApply(
    _: SuggestedEditsSidebar,
    suggestion: IResolvedSuggestion
  ): void {
    const panel = this._notebookSignals?.panel;
    if (!panel || panel.isDisposed) {
      this.updateState({ status: 'Notebook is no longer available.' });
      return;
    }

    const widgets = panel.content.widgets;
    if (suggestion.cellIndex < 0 || suggestion.cellIndex >= widgets.length) {
      this.updateState({ status: 'Suggested cell index is out of range.' });
      return;
    }

    const cell = widgets[suggestion.cellIndex];
    const shared = cell.model.sharedModel;
    const normalized = suggestion.replacementSource ?? '';

    shared.transact(() => {
      shared.setSource(normalized);
    });

    this.updateState({ status: 'Suggestion applied!' });
  }

  public handleDismiss(suggestion: IResolvedSuggestion): void {
    if (this._state.globalSuggestion?.id === suggestion.id) {
      this.updateState({ globalSuggestion: null });
      this.updateStatusAfterRemoval();
    } else {
      const idx = this._state.localSuggestions.findIndex(
        s => s?.id === suggestion.id
      );
      if (idx !== -1) {
        const local = [...this._state.localSuggestions];
        local.splice(idx, 1);
        local.push(null);
        this.updateState({ localSuggestions: local });
        this.updateStatusAfterRemoval();
      }
    }
  }

  private updateStatusAfterRemoval(): void {
    const hasAny =
      this._state.localSuggestions.some(s => s !== null) ||
      this._state.globalSuggestion !== null;
    if (!hasAny) {
      this.updateState({ status: 'All suggestions dismissed.' });
    }
  }

  private cancelPendingStream(): void {
    void this._debouncer.stop();
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
      this.updateState({ status: 'Paused.', isPaused: true });
    } else {
      this.updateState({ isPaused: false });
      void this.refresh('context');
    }
  }

  public handleViewChange(view: 'home' | 'settings'): void {
    this.updateState({ view });
  }

  public handlePromptSelect(mode: SuggestionScanMode, id: string): void {
    if (mode === 'full') {
      this.updateState({ selectedGlobalPromptId: id });
    } else {
      this.updateState({ selectedLocalPromptId: id });
    }
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
      contextType: suggestion.contextType ?? 'local',
      notebookPath: this._lastSnapshot?.path
    };
  }

  private lookupOriginalSource(index: number): string {
    const snapshot = this._lastSnapshot;
    if (!snapshot) {
      return '';
    }
    const cell = snapshot.cells.find(
      (entry: INotebookCellSnapshot) => entry.cellIndex === index
    );
    return cell?.source ?? '';
  }

  private loadingMessageForMode(): string {
    return this._activeMode === 'full'
      ? 'Scanning entire notebook for suggestions…'
      : 'Streaming contextual suggestions…';
  }

  private onDismissRequested(_: any, s: IResolvedSuggestion): void {
    this.handleDismiss(s);
  }

  private onViewChanged(_: any, v: 'home' | 'settings'): void {
    this.handleViewChange(v);
  }

  private onPromptSelected(
    _: any,
    { mode, id }: { mode: 'context' | 'full'; id: string }
  ): void {
    this.handlePromptSelect(mode, id);
  }

  private _notebookSignals: INotebookSignals | null = null;
  private _debouncer: Debouncer;
  private _currentAbort: AbortController | null = null;
  private _lastSnapshot: INotebookSnapshot | null = null;
  private _activeMode: SuggestionScanMode = 'context';
  private _isPaused = false;
  private _disposed = false;

  private _state: ISuggestedEditsState = {
    status: 'Waiting for notebook activity.',
    isPaused: false,
    hasApiKey: false,
    localSuggestions: [null, null],
    globalSuggestion: null,
    selectedLocalPromptId: 'default_local',
    selectedGlobalPromptId: 'default_global',
    view: 'home'
  };
}
