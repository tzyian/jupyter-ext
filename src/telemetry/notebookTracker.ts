import { IDisposable } from '@lumino/disposable';
import type { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { NotebookActions } from '@jupyterlab/notebook';
import type { ICellModel } from '@jupyterlab/cells';
import type { IObservableList } from '@jupyterlab/observables';
import type { TelemetryService } from './telemetryService';

import { Contents } from '@jupyterlab/services';

/**
 * Tracks notebook-level telemetry events using JupyterLab signals and DOM events.
 */
export class NotebookTelemetryTracker implements IDisposable {
  private _disposed = false;
  private _currentPanel: NotebookPanel | null = null;
  private _editingSession: {
    cellId: string;
    startTime: number;
    idleTimer: number | null;
  } | null = null;
  private _visibilityStartTime: number | null = null;
  private readonly _idleTimeoutMs = 60000; // 60 seconds
  private _currentCellModel: ICellModel | null = null; // Track cell model for content listener cleanup

  // Session tracking for notebook time
  private _notebookSessionStart: number | null = null;
  private _currentNotebookPath: string | null = null;

  constructor(
    private readonly _tracker: INotebookTracker,
    private readonly _telemetry: TelemetryService,
    private readonly _contents: Contents.IManager
  ) {
    // Track when notebooks are opened/closed
    this._tracker.widgetAdded.connect(this._onNotebookAdded, this);
    this._tracker.currentChanged.connect(this._onCurrentChanged, this);

    // Track cell execution
    NotebookActions.executed.connect(this._onCellExecuted, this);

    // Track visibility changes (tab switching)
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Track file renames
    this._contents.fileChanged.connect(this._onFileChanged, this);

    // Attach to current notebook if any
    if (this._tracker.currentWidget) {
      this._attachNotebook(this._tracker.currentWidget);
    }
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    // End notebook session on disposal
    this._endNotebookSession();

    this._detachNotebook();
    this._tracker.widgetAdded.disconnect(this._onNotebookAdded, this);
    this._tracker.currentChanged.disconnect(this._onCurrentChanged, this);
    NotebookActions.executed.disconnect(this._onCellExecuted, this);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._contents.fileChanged.disconnect(this._onFileChanged, this);
  }

  private _onFileChanged = (
    _: Contents.IManager,
    change: Contents.IChangedArgs
  ): void => {
    if (change.type !== 'rename' || !change.oldValue || !change.newValue) {
      return;
    }

    const oldPath = change.oldValue.path;
    const newPath = change.newValue.path;

    if (!oldPath || !newPath) {
      return;
    }

    // Only migrate for notebook files
    if (oldPath.endsWith('.ipynb') && newPath.endsWith('.ipynb')) {
      console.log(
        `[NotebookTracker] Detected notebook rename: ${oldPath} -> ${newPath}`
      );
      void this._telemetry.notifyRename(oldPath, newPath);
    }
  };

  private _onNotebookAdded(_: INotebookTracker, panel: NotebookPanel): void {
    this._telemetry.logEvent('NotebookOpenEvent', {
      notebookPath: panel.context.path,
      path: panel.context.path,
      kernel: panel.sessionContext.kernelDisplayName
    });

    // Start session tracking
    this._notebookSessionStart = Date.now() / 1000;
    this._currentNotebookPath = panel.context.path;
  }

  private _getCurrentNotebookPath(): string | null {
    return this._currentPanel?.context.path ?? null;
  }

  private _onCurrentChanged(
    _: INotebookTracker,
    panel: NotebookPanel | null
  ): void {
    // End previous notebook session
    this._endNotebookSession();

    this._detachNotebook();
    if (panel) {
      this._attachNotebook(panel);

      // Start new notebook session
      this._notebookSessionStart = Date.now() / 1000;
      this._currentNotebookPath = panel.context.path;
    }
  }

  private _attachNotebook(panel: NotebookPanel): void {
    this._currentPanel = panel;
    const { content, model, context } = panel;

    // Track cell changes
    content.activeCellChanged.connect(this._onActiveCellChanged, this);
    if (model) {
      model.cells.changed.connect(this._onCellsChanged, this);
    }

    // Track saves
    context.saveState.connect(this._onSaveStateChanged, this);

    // Attach DOM event listeners
    const node = content.node;
    node.addEventListener('copy', this._onClipboard);
    node.addEventListener('cut', this._onClipboard);
    node.addEventListener('paste', this._onClipboard);
    node.addEventListener('scroll', this._onScroll);
  }

  private _detachNotebook(): void {
    if (!this._currentPanel) {
      return;
    }

    const { content, model, context } = this._currentPanel;

    content.activeCellChanged.disconnect(this._onActiveCellChanged, this);
    if (model) {
      model.cells.changed.disconnect(this._onCellsChanged, this);
    }
    context.saveState.disconnect(this._onSaveStateChanged, this);

    const node = content.node;
    node.removeEventListener('copy', this._onClipboard);
    node.removeEventListener('cut', this._onClipboard);
    node.removeEventListener('paste', this._onClipboard);
    node.removeEventListener('scroll', this._onScroll);

    // Disconnect any attached cell content listener
    if (this._currentCellModel) {
      this._currentCellModel.contentChanged.disconnect(
        this._onCellContentChanged,
        this
      );
      this._currentCellModel = null;
    }

    this._endEditingSession();
    this._currentPanel = null;
  }

  private _onActiveCellChanged = (): void => {
    if (!this._currentPanel) {
      return;
    }

    const activeCell = this._currentPanel.content.activeCell;
    if (!activeCell) {
      this._endEditingSession();
      return;
    }

    const cellId = activeCell.model.id;
    const cellIndex = this._currentPanel.content.activeCellIndex;

    // End previous editing session
    this._endEditingSession();

    // Disconnect previous cell content listener to prevent memory leak
    if (this._currentCellModel) {
      this._currentCellModel.contentChanged.disconnect(
        this._onCellContentChanged,
        this
      );
      this._currentCellModel = null;
    }

    // Log cell change
    this._telemetry.logEvent('ActiveCellChangeEvent', {
      cellId,
      cellIndex,
      notebookPath: this._getCurrentNotebookPath()
    });

    // Start tracking edits on this cell
    activeCell.model.contentChanged.connect(this._onCellContentChanged, this);
    this._currentCellModel = activeCell.model;
  };

  private _onCellContentChanged = (): void => {
    if (!this._currentPanel) {
      return;
    }

    const activeCell = this._currentPanel.content.activeCell;
    if (!activeCell) {
      return;
    }

    const cellId = activeCell.model.id;
    const now = Date.now();

    // Start new session or reset idle timer
    if (!this._editingSession || this._editingSession.cellId !== cellId) {
      this._endEditingSession();
      this._editingSession = {
        cellId,
        startTime: now,
        idleTimer: null
      };
    }

    // Reset idle timeout
    if (this._editingSession.idleTimer !== null) {
      window.clearTimeout(this._editingSession.idleTimer);
    }

    this._editingSession.idleTimer = window.setTimeout(() => {
      this._endEditingSession();
    }, this._idleTimeoutMs);
  };

  private _endEditingSession(): void {
    if (!this._editingSession) {
      return;
    }

    const duration = (Date.now() - this._editingSession.startTime) / 1000;

    if (this._editingSession.idleTimer !== null) {
      window.clearTimeout(this._editingSession.idleTimer);
    }

    console.log(
      `[NotebookTracker] Ending editing session for cell ${this._editingSession.cellId}, duration: ${duration.toFixed(2)}s`
    );

    this._telemetry.logEvent('CellEditEvent', {
      cellId: this._editingSession.cellId,
      duration,
      notebookPath: this._getCurrentNotebookPath()
    });

    this._editingSession = null;
  }

  private _endNotebookSession(): void {
    if (this._notebookSessionStart === null) {
      return;
    }

    const duration = Date.now() / 1000 - this._notebookSessionStart;

    console.log(
      `[NotebookTracker] Ending notebook session for ${this._currentNotebookPath}, duration: ${duration.toFixed(2)}s`
    );

    this._telemetry.logEvent('NotebookSessionEvent', {
      notebookPath: this._currentNotebookPath,
      duration
    });

    this._notebookSessionStart = null;
    this._currentNotebookPath = null;
  }

  private _onCellsChanged = (
    _: any,
    change: IObservableList.IChangedArgs<ICellModel>
  ): void => {
    if (change.type === 'add') {
      const newCells = change.newValues;
      newCells.forEach((cell, idx) => {
        this._telemetry.logEvent('CellAddEvent', {
          cellId: cell.id,
          cellIndex: change.newIndex + idx,
          notebookPath: this._getCurrentNotebookPath()
        });
      });
    } else if (change.type === 'remove') {
      const oldCells = change.oldValues;
      oldCells.forEach((cell, idx) => {
        this._telemetry.logEvent('CellRemoveEvent', {
          cellId: cell.id,
          cellIndex: change.oldIndex + idx,
          notebookPath: this._getCurrentNotebookPath()
        });
      });
    }
  };

  private _onSaveStateChanged = (_: any, saveState: string): void => {
    if (!this._currentPanel) {
      return;
    }

    if (saveState === 'completed') {
      this._telemetry.logEvent('NotebookSaveEvent', {
        notebookPath: this._currentPanel.context.path,
        path: this._currentPanel.context.path
      });
    }
  };
  private _onClipboard = (ev: Event): void => {
    if (!this._currentPanel) {
      return;
    }

    const activeCell = this._currentPanel.content.activeCell;
    if (!activeCell) {
      return;
    }

    const type = ev?.type ?? '';
    const eventName =
      type === 'copy'
        ? 'ClipboardCopyEvent'
        : type === 'cut'
          ? 'ClipboardCutEvent'
          : type === 'paste'
            ? 'ClipboardPasteEvent'
            : 'ClipboardEvent';

    this._telemetry.logEvent(eventName, {
      cellId: activeCell.model.id,
      cellIndex: this._currentPanel.content.activeCellIndex,
      notebookPath: this._getCurrentNotebookPath()
    });
  };

  private _onScroll = (): void => {
    // Throttled scroll tracking could be added here if needed
    // For now, we skip to avoid excessive events
  };

  private _onCellExecuted = (
    _: any,
    args: { notebook: any; cell: any; success: boolean }
  ): void => {
    // Only track executions for the current notebook
    if (!this._currentPanel || args.notebook !== this._currentPanel.content) {
      return;
    }

    const cellId = args.cell?.model?.id;
    const cellIndex = this._currentPanel.content.activeCellIndex;

    console.log(
      `[NotebookTracker] Cell executed: ${cellId}, success: ${args.success}`
    );

    this._telemetry.logEvent('CellExecuteEvent', {
      cellId,
      cellIndex,
      success: args.success,
      notebookPath: this._getCurrentNotebookPath()
    });
  };

  private _onVisibilityChange = (): void => {
    const now = Date.now() / 1000;

    if (document.hidden) {
      // User left the tab - only log if not already hidden
      if (this._visibilityStartTime === null) {
        this._visibilityStartTime = now;
        console.log('[NotebookTracker] User left tab (hidden)');
        this._telemetry.logEvent('NotebookHiddenEvent', {
          notebookPath: this._getCurrentNotebookPath()
        });

        // Pause notebook session (end current session)
        this._endNotebookSession();
      }
    } else {
      // User returned to the tab
      if (this._visibilityStartTime !== null) {
        const duration = now - this._visibilityStartTime;
        console.log(
          `[NotebookTracker] User returned to tab, was away for ${duration.toFixed(2)}s`
        );
        this._telemetry.logEvent('NotebookVisibleEvent', {
          duration,
          notebookPath: this._getCurrentNotebookPath()
        });
        this._visibilityStartTime = null;

        // Resume notebook session (start new session)
        if (this._currentPanel) {
          this._notebookSessionStart = now;
          this._currentNotebookPath = this._currentPanel.context.path;
        }
      }
    }
  };
}
