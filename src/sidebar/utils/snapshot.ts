import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import type { Cell, ICellModel } from '@jupyterlab/cells';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import type { NotebookPanel } from '@jupyterlab/notebook';

import type {
  IActiveCellContext,
  INotebookCellSnapshot,
  INotebookOutlineItem,
  INotebookSnapshot
} from '../types';

/**
 * Build a snapshot of the current notebook state.
 */
export function buildSnapshot(
  panel: NotebookPanel,
  maxLength: number
): INotebookSnapshot {
  const notebook = panel.content;
  const model = notebook.model;
  const outline: INotebookOutlineItem[] = [];
  const cells: INotebookCellSnapshot[] = [];

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
      cellIndex: index,
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
  cell: Cell | null,
  cellIndex: number
): IActiveCellContext | undefined {
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
      let startOffset = editor.getOffsetAt(selectionRange.start);
      let endOffset = editor.getOffsetAt(selectionRange.end);

      // Handle backwards selection where endOffset is before startOffset
      if (startOffset > endOffset) {
        const temp = startOffset;
        startOffset = endOffset;
        endOffset = temp;
      }

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

  if (!selectedText && typeof document !== 'undefined') {
    const domSelection = document.getSelection();
    const cellNode = (cell as { node?: Node | null }).node ?? null;
    const anchorNode = domSelection?.anchorNode ?? null;
    const focusNode = domSelection?.focusNode ?? null;
    const isWithinActiveCell =
      !!domSelection &&
      !!cellNode &&
      !!anchorNode &&
      !!focusNode &&
      cellNode.contains(anchorNode) &&
      cellNode.contains(focusNode);

    if (isWithinActiveCell) {
      const previewLimit = 1200;
      const domSelectedText = domSelection.toString().trim();
      if (domSelectedText) {
        selectedText = domSelectedText.slice(0, previewLimit);
      }
    }
  }

  return {
    cellIndex,
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
