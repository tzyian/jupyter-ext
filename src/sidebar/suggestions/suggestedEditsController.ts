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
  SuggestionStreamEvent,
  ISuggestedEditsState
} from './types';
import { SuggestedEditsSidebar } from './SuggestedEditsSidebar';
import { streamSuggestions } from '../api';
import { buildSnapshot } from '../utils/snapshot';
import { buildDiffSegments } from '../utils/diff';
import { NotebookSignalGroup } from '../../telemetry/notebookSignals';
import { useSuggestedEditsStore } from './useSuggestedEditsStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

/**
 * Controller for the suggested edits sidebar.
 * Orchestrates notebook tracking, suggestion streaming, and UI updates.
 */
export class SuggestedEditsController implements IDisposable {
  private _notebookSignals: NotebookSignalGroup | null = null;
  private _debouncer: Debouncer;
  private _currentAbort: AbortController | null = null;
  private _lastSnapshot: INotebookSnapshot | null = null;
  private _activeMode: SuggestionScanMode = 'context';
  private _isPaused = false;
  private _disposed = false;

  constructor(
    private readonly _tracker: INotebookTracker,
    private readonly _panel: SuggestedEditsSidebar
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

    const settings = useSettingsStore.getState().settings;
    this._debouncer = new Debouncer(() => {
      void this.refresh('context');
    }, settings?.debounceMs ?? 1000);

    // Initial state sync (though store handles defaults)
    useSuggestedEditsStore.getState().setHasApiKey(!!settings?.openaiApiKey);
  }

  get state(): ISuggestedEditsState {
    return useSuggestedEditsStore.getState();
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
    if (!settings.autoRefresh) {
      this.cancelPendingStream();
      this.showIdle();
    } else {
      void this._debouncer.invoke();
    }
    useSuggestedEditsStore.getState().setHasApiKey(!!settings.openaiApiKey);
  }

  private showIdle(): void {
    const { setLocalSuggestions, setGlobalSuggestion, setStatus } =
      useSuggestedEditsStore.getState();
    setLocalSuggestions([null, null]);
    setGlobalSuggestion(null);
    setStatus('Waiting for notebook activity.');
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
    const settings = useSettingsStore.getState().settings;
    const signals = new NotebookSignalGroup(panel, () => {
      if (settings?.autoRefresh) {
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
    const {
      setStatus,
      setGlobalSuggestion,
      selectedGlobalPromptId,
      selectedLocalPromptId
    } = useSuggestedEditsStore.getState();
    const settings = useSettingsStore.getState().settings;

    if (!this._notebookSignals || this._isPaused) {
      this.showIdle();
      return;
    }

    if (!settings) {
      return;
    }

    const { panel } = this._notebookSignals;
    const snapshot = buildSnapshot(panel, settings.maxCellCharacters);
    this._lastSnapshot = snapshot;
    this.cancelPendingStream();
    this._activeMode = mode;
    setStatus(this.loadingMessageForMode());

    const controller = new AbortController();
    this._currentAbort = controller;

    const promptId =
      mode === 'full' ? selectedGlobalPromptId : selectedLocalPromptId;

    if (mode === 'full') {
      setGlobalSuggestion(null);
    }

    try {
      for await (const event of streamSuggestions(
        snapshot,
        settings,
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
      setStatus(`Failed to update suggestions: ${message}`);
    } finally {
      if (this._currentAbort === controller) {
        this._currentAbort = null;
      }
    }
  }

  private showComplete(mode: SuggestionScanMode): void {
    const { globalSuggestion, localSuggestions, setStatus } =
      useSuggestedEditsStore.getState();
    if (mode === 'full') {
      const status = globalSuggestion
        ? 'Global suggestion ready.'
        : 'No global suggestions found.';
      setStatus(status);
    } else {
      const status = localSuggestions.some(s => s !== null)
        ? 'Latest suggestions ready.'
        : 'No new local suggestions.';
      setStatus(status);
    }
  }

  private processStreamEvent(event: SuggestionStreamEvent): void {
    const { setStatus } = useSuggestedEditsStore.getState();
    switch (event.type) {
      case 'status':
        if (event.phase === 'started') {
          setStatus(this.loadingMessageForMode());
        }
        break;
      case 'suggestion':
        this.handleSuggestionEvent(event.payload);
        break;
      case 'info':
        setStatus(event.message);
        break;
      default:
        break;
    }
  }

  private handleSuggestionEvent(
    payload: ISuggestion | IResolvedSuggestion
  ): void {
    const { setGlobalSuggestion, addLocalSuggestion } =
      useSuggestedEditsStore.getState();
    const suggestion = this.ensureResolvedSuggestion(payload);
    if (suggestion.contextType === 'global') {
      setGlobalSuggestion(suggestion);
    } else {
      addLocalSuggestion(suggestion);
    }
  }

  private handleApply(
    _: SuggestedEditsSidebar,
    suggestion: IResolvedSuggestion
  ): void {
    const { setStatus } = useSuggestedEditsStore.getState();
    const panel = this._notebookSignals?.panel;
    if (!panel || panel.isDisposed) {
      setStatus('Notebook is no longer available.');
      return;
    }

    const widgets = panel.content.widgets;
    if (suggestion.cellIndex < 0 || suggestion.cellIndex >= widgets.length) {
      setStatus('Suggested cell index is out of range.');
      return;
    }

    const cell = widgets[suggestion.cellIndex];
    const shared = cell.model.sharedModel;
    const normalized = suggestion.replacementSource ?? '';

    shared.transact(() => {
      shared.setSource(normalized);
    });

    setStatus('Suggestion applied!');
  }

  public handleDismiss(suggestion: IResolvedSuggestion): void {
    const { dismissSuggestion, setStatus } = useSuggestedEditsStore.getState();
    dismissSuggestion(suggestion);

    // Check after dismissing
    const state = useSuggestedEditsStore.getState();
    const hasAny =
      state.localSuggestions.some(s => s !== null) ||
      state.globalSuggestion !== null;
    if (!hasAny) {
      setStatus('All suggestions dismissed.');
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
    const { setPaused, setStatus } = useSuggestedEditsStore.getState();
    this._isPaused = !this._isPaused;

    if (this._isPaused) {
      this.cancelPendingStream();
      setPaused(true);
      setStatus('Paused.');
    } else {
      setPaused(false);
      void this.refresh('context');
    }
  }

  public handleViewChange(view: 'home' | 'settings'): void {
    useSuggestedEditsStore.getState().setView(view);
  }

  public handlePromptSelect(mode: SuggestionScanMode, id: string): void {
    const { setSelectedGlobalPromptId, setSelectedLocalPromptId } =
      useSuggestedEditsStore.getState();
    if (mode === 'full') {
      setSelectedGlobalPromptId(id);
    } else {
      setSelectedLocalPromptId(id);
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
}
