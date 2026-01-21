import { IDisposable } from '@lumino/disposable';
import type { IChangedArgs } from '@jupyterlab/coreutils';
import type { Notebook, NotebookPanel } from '@jupyterlab/notebook';

/**
 * Interface for notebook signal management.
 */
export interface INotebookSignals extends IDisposable {
  readonly panel: NotebookPanel;
}

/**
 * A group of signals for a single notebook panel.
 */
export class NotebookSignalGroup implements INotebookSignals {
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
