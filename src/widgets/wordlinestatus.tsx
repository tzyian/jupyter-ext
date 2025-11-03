import { INotebookTracker } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';

class MarkdownWordLineStatus extends ReactWidget {
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
    if (this._onCellsChanged && this._cellsList) {
      this._cellsList.changed.disconnect(this._onCellsChanged, this);
    }
    this._cellsList = null;
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
    // Reconnect to the current notebook's cell list to track add/remove/type changes
    this._disconnectFromNotebook();
    const nb = this.tracker.currentWidget?.content as any;
    const model = nb?.model ?? null;
    const cells = model?.cells ?? null; // IObservableUndoableList<ICellModel>

    if (cells && typeof cells.changed?.connect === 'function') {
      this._cellsList = cells;
      this._onCellsChanged = () => this.update();
      cells.changed.connect(this._onCellsChanged, this);
    }
    this.update();
  }

  render(): JSX.Element {
    const notebookPanel = this.tracker.currentWidget as any;
    const nb = notebookPanel?.content;
    const widgets = nb?.widgets ?? [];
    const total = widgets.length;

    // Count totals
    let code = 0;
    let md = 0;
    for (const w of widgets) {
      const t = (w.model as any)?.type as string | undefined;
      if (t === 'code') {
        code += 1;
      } else if (t === 'markdown') {
        md += 1;
      }
    }

    const pct = (n: number, d: number) =>
      d > 0 ? Math.round((n / d) * 100) : 0;

    // Active cell text stats
    const cell = this.tracker.activeCell as any;
    const text: string = cell?.editor?.model?.sharedModel?.getSource?.() ?? '';
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const lines = text ? text.split(/\r\n|\r|\n/).length : 0;

    // Output format: Words:121|LineCount:5|MD:1(20%)|PY:4(80%)|Tot:5
    const msg = `Words:${words}, Lines:${lines} | MD:${md}(${pct(md, total)}%), PY:${code}(${pct(code, total)}%) Tot:${total}`;

    return <span title="Notebook summary">{msg}</span>;
  }

  private _editorModel: CodeEditor.IModel | null = null;
  private _onSharedChanged: ((sender: any, change: any) => void) | null = null;
  private _cellsList: any | null = null;
  private _onCellsChanged: ((sender: any, change: any) => void) | null = null;
  // _onCurrentNotebookChanged is a class method; no backing field needed
}

export function registerWordLineStatus(
  tracker: INotebookTracker,
  statusBar: IStatusBar
): void {
  const item = new MarkdownWordLineStatus(tracker);
  statusBar.registerStatusItem('selenejs:markdown-word-lines', {
    item,
    align: 'left',
    rank: 3,
    isActive: () => true
  });
}
