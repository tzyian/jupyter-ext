import { IDisposable } from '@lumino/disposable';
import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import type { ICellModel } from '@jupyterlab/cells';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import type {
  Notebook,
  NotebookPanel,
  INotebookTracker
} from '@jupyterlab/notebook';
import type { IChangedArgs } from '@jupyterlab/coreutils';

import type {
  INotebookSnapshot,
  IResolvedSuggestion,
  ISuggestion,
  ISuggestedEditsSettings,
  IReadonlyDiffSegment,
  SuggestionScanMode,
  SuggestionStreamEvent
} from '../types';
import { SuggestedEditsSidebar } from './suggestedEditsPanel';
import { streamSuggestions } from './suggestionStream';

interface INotebookSignals extends IDisposable {
  readonly panel: NotebookPanel;
}

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
    if (!this._notebookSignals) {
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
    if (!this._notebookSignals) {
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
      diffSegments: this.buildDiffSegments(
        original,
        suggestion.replacementSource
      ),
      contextType: suggestion.contextType ?? 'local'
    };
  }

  private lookupOriginalSource(index: number): string {
    const snapshot = this._lastSnapshot;
    if (!snapshot) {
      return '';
    }
    const cell = snapshot.cells.find(entry => entry.index === index);
    return cell?.source ?? '';
  }

  private buildDiffSegments(
    original: string,
    replacement: string
  ): IReadonlyDiffSegment[] {
    if (original === replacement) {
      return original ? [{ value: original, type: 'unchanged' }] : [];
    }

    const segments: IReadonlyDiffSegment[] = [];
    if (original) {
      segments.push({ value: original, type: 'removed' });
    }
    if (replacement) {
      segments.push({ value: replacement, type: 'added' });
    }
    return segments.length ? segments : [{ value: '', type: 'unchanged' }];
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
  private _disposed = false;
}

class NotebookSignalGroup implements INotebookSignals {
  constructor(panel: NotebookPanel, onChange: () => void) {
    this._panel = panel;
    this._onChange = onChange;

    const model = panel.context.model;
    if (model) {
      model.contentChanged.connect(this.handleModelChange, this);
      model.stateChanged.connect(this.handleStateChange, this);
    }

    panel.content.activeCellChanged.connect(this.handleActiveCellChange, this);
    panel.context.pathChanged.connect(this.handlePathChange, this);
  }

  get panel(): NotebookPanel {
    return this._panel;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._disposed = true;
    const model = this._panel.context.model;
    if (model) {
      model.contentChanged.disconnect(this.handleModelChange, this);
      model.stateChanged.disconnect(this.handleStateChange, this);
    }
    this._panel.content.activeCellChanged.disconnect(
      this.handleActiveCellChange,
      this
    );
    this._panel.context.pathChanged.disconnect(this.handlePathChange, this);
  }

  private handleModelChange(): void {
    this._onChange();
  }

  private handleStateChange(
    _: NotebookPanel['context']['model'],
    args: IChangedArgs<any, any, string>
  ): void {
    if (args.name === 'dirty' && args.newValue === false) {
      return;
    }
    this._onChange();
  }

  private handleActiveCellChange(_: Notebook, __: unknown): void {
    this._onChange();
  }

  private handlePathChange(): void {
    this._onChange();
  }

  private readonly _panel: NotebookPanel;
  private readonly _onChange: () => void;
  private _disposed = false;
}

function buildSnapshot(
  panel: NotebookPanel,
  maxLength: number
): INotebookSnapshot {
  const notebook = panel.content;
  const model = notebook.model;
  const outline: INotebookSnapshot['outline'] = [];
  const cells: INotebookSnapshot['cells'] = [];

  const activeCellContext = resolveActiveCellContext(
    notebook.activeCell,
    notebook.activeCellIndex ?? 0
  );

  if (!model) {
    return {
      path: panel.context.path,
      activeCellIndex: notebook.activeCellIndex ?? 0,
      activeCellContext,
      outline,
      cells,
      lastActivity: new Date().toISOString()
    };
  }

  const trunc = (value: string) =>
    value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

  for (let index = 0; index < model.cells.length; index++) {
    const cellModel = model.cells.get(index);
    const cellType = cellModel.type as 'code' | 'markdown' | 'raw';
    const source = getCellSource(cellModel);

    if (cellType === 'markdown') {
      const lines = source.split(/\r?\n/);
      for (const line of lines) {
        const match = /^\s*(#{1,6})\s+(.*)/.exec(line.trim());
        if (match) {
          outline.push({
            level: match[1].length,
            text: match[2],
            cellIndex: index
          });
          break;
        }
      }
    }

    cells.push({
      cellType,
      source: trunc(source),
      index,
      metadata: extractMetadata(cellModel)
    });
  }

  return {
    path: panel.context.path,
    activeCellIndex: notebook.activeCellIndex ?? 0,
    activeCellContext,
    outline,
    cells,
    lastActivity: new Date().toISOString()
  };
}

function resolveActiveCellContext(
  cell: Notebook['activeCell'],
  cellIndex: number
): INotebookSnapshot['activeCellContext'] {
  if (!cell) {
    return undefined;
  }
  const editor = cell.editor as CodeEditor.IEditor | undefined;
  if (!editor) {
    return undefined;
  }

  let cursorOffset: number | null = null;
  try {
    const cursor = editor.getCursorPosition();
    cursorOffset = editor.getOffsetAt(cursor);
  } catch (error) {
    cursorOffset = null;
  }

  let selectedText: string | undefined;
  const source = cell.model ? getCellSource(cell.model) : '';
  let selectionRange: CodeEditor.IRange | null | undefined;

  if (typeof editor.getSelection === 'function') {
    selectionRange = editor.getSelection() as CodeEditor.IRange | null;
  } else if (typeof editor.getSelections === 'function') {
    const selections = editor.getSelections();
    selectionRange = selections && selections.length > 0 ? selections[0] : null;
  }

  if (selectionRange) {
    try {
      const startOffset = editor.getOffsetAt(selectionRange.start);
      const endOffset = editor.getOffsetAt(selectionRange.end);
      if (endOffset > startOffset) {
        const previewLimit = 1200;
        selectedText = source.slice(
          startOffset,
          Math.min(endOffset, startOffset + previewLimit)
        );
      }
    } catch (error) {
      selectedText = undefined;
    }
  }

  return {
    index: cellIndex,
    cursorOffset,
    selectedText
  };
}

export function defaultSettings(): ISuggestedEditsSettings {
  return {
    autoRefresh: true,
    debounceMs: 5000,
    maxCellCharacters: 3000,
    contextWindow: 3
  };
}

function getCellSource(model: ICellModel): string {
  const shared = model.sharedModel;
  if ('getSource' in shared && typeof shared.getSource === 'function') {
    return shared.getSource() as string;
  }
  if ('source' in shared && typeof shared.source === 'string') {
    return shared.source as string;
  }
  const valueLike = (model as { value?: { text?: string } }).value;
  if (valueLike?.text) {
    return valueLike.text;
  }
  return '';
}

function extractMetadata(model: ICellModel): ReadonlyPartialJSONObject {
  const observable = model.metadata as unknown as {
    toJSON?: () => Record<string, unknown>;
  } | null;
  return observable?.toJSON
    ? (observable.toJSON() as ReadonlyPartialJSONObject)
    : {};
}
