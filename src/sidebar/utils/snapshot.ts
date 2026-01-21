import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import type { ICellModel } from '@jupyterlab/cells';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import type { Notebook, NotebookPanel } from '@jupyterlab/notebook';

import type { INotebookSnapshot } from '../../types';

/**
 * Build a snapshot of the current notebook state.
 */
export function buildSnapshot(
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

/**
 * Resolve the context of the active cell, including cursor position and selection.
 */
export function resolveActiveCellContext(
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

/**
 * Get the source text of a cell model.
 */
export function getCellSource(model: ICellModel): string {
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

/**
 * Extract metadata from a cell model.
 */
export function extractMetadata(model: ICellModel): ReadonlyPartialJSONObject {
  const observable = model.metadata as unknown as {
    toJSON?: () => Record<string, unknown>;
  } | null;
  return observable?.toJSON
    ? (observable.toJSON() as ReadonlyPartialJSONObject)
    : {};
}
