import { INotebookTracker, INotebookModel } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';

/**
 * Statistics for the current notebook and active cell.
 */
interface INotebookSummaryStats {
  words: number;
  lines: number;
  markdownCells: number;
  codeCells: number;
  totalCells: number;
}

const NotebookSummaryComponent = (props: { stats: INotebookSummaryStats }) => {
  const { stats } = props;
  const { words, lines, markdownCells, codeCells, totalCells } = stats;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const msg = `Words:${words}, Lines:${lines} | MD:${markdownCells}(${pct(
    markdownCells,
    totalCells
  )}%), PY:${codeCells}(${pct(codeCells, totalCells)}%) Tot:${totalCells}`;

  return <span title="Notebook summary">{msg}</span>;
};

class NotebookSummaryStatus extends ReactWidget {
  constructor(private tracker: INotebookTracker) {
    super();
    this.addClass('jp-WordLineStatus');

    this._onActiveCellChanged = this._onActiveCellChanged.bind(this);
    this._onCurrentNotebookChanged = this._onCurrentNotebookChanged.bind(this);

    tracker.activeCellChanged.connect(this._onActiveCellChanged);
    tracker.currentChanged.connect(this._onCurrentNotebookChanged);

    this._onCurrentNotebookChanged();
    this._onActiveCellChanged();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._disconnectFromCell();
    this._disconnectFromNotebook();
    this.tracker.activeCellChanged.disconnect(this._onActiveCellChanged);
    this.tracker.currentChanged.disconnect(this._onCurrentNotebookChanged);
    super.dispose();
  }

  private _disconnectFromCell() {
    if (this._onSharedChanged && this._editorModel) {
      this._editorModel.sharedModel.changed.disconnect(
        this._onSharedChanged,
        this
      );
    }
    this._editorModel = null;
  }

  private _disconnectFromNotebook() {
    if (this._onContentChanged && this._notebookModel) {
      this._notebookModel.contentChanged.disconnect(
        this._onContentChanged,
        this
      );
    }
    this._notebookModel = null;
  }

  private _onActiveCellChanged() {
    this._disconnectFromCell();
    const cell = this.tracker.activeCell;
    this._editorModel = cell?.editor?.model ?? null;

    if (this._editorModel) {
      this._onSharedChanged = () => this.update();
      this._editorModel.sharedModel.changed.connect(
        this._onSharedChanged,
        this
      );
    }
    this.update();
  }

  private _onCurrentNotebookChanged() {
    // Reconnect to the current notebook's content changed signal
    this._disconnectFromNotebook();
    const panel = this.tracker.currentWidget;
    const model = panel?.model;

    if (model) {
      this._notebookModel = model;
      this._onContentChanged = () => this.update();
      model.contentChanged.connect(this._onContentChanged, this);
    }
    this.update();
  }

  private _calculateStats(): INotebookSummaryStats {
    const panel = this.tracker.currentWidget;
    const nb = panel?.content;
    const widgets = nb?.widgets ?? [];
    const totalCells = widgets.length;

    // Count totals
    let codeCells = 0;
    let markdownCells = 0;
    for (const w of widgets) {
      const type = w.model.type;
      if (type === 'code') {
        codeCells += 1;
      } else if (type === 'markdown') {
        markdownCells += 1;
      }
    }

    // Active cell text stats
    const cell = this.tracker.activeCell;
    const text: string = cell?.model.sharedModel.getSource() ?? '';
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const lines = text ? text.split(/\r\n|\r|\n/).length : 0;

    return {
      words,
      lines,
      markdownCells,
      codeCells,
      totalCells
    };
  }

  render(): JSX.Element {
    const stats = this._calculateStats();
    return <NotebookSummaryComponent stats={stats} />;
  }

  private _editorModel: CodeEditor.IModel | null = null;
  private _onSharedChanged: ((sender: any, change: any) => void) | null = null;
  private _notebookModel: INotebookModel | null = null;
  private _onContentChanged: ((sender: any, change: any) => void) | null = null;
}

export function registerWordLineStatus(
  tracker: INotebookTracker,
  statusBar: IStatusBar
): void {
  const item = new NotebookSummaryStatus(tracker);
  statusBar.registerStatusItem('selenejs:markdown-word-lines', {
    item,
    align: 'left',
    rank: 3,
    isActive: () => true
  });
}
