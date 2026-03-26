import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';

export interface INotebookOutlineItem {
  readonly level: number;
  readonly text: string;
  readonly cellIndex: number;
}

export interface INotebookCellSnapshot {
  readonly cellType: 'code' | 'markdown' | 'raw';
  readonly source: string;
  readonly cellIndex: number;
  readonly metadata: ReadonlyPartialJSONObject;
}

export interface INotebookSnapshot {
  readonly path: string;
  readonly activeCellIndex: number;
  readonly activeCellContext?: IActiveCellContext;
  readonly outline: INotebookOutlineItem[];
  readonly cells: INotebookCellSnapshot[];
  readonly lastActivity: string;
}

export interface IActiveCellContext {
  readonly cellIndex: number;
  readonly cursorOffset: number | null;
  readonly selectedText?: string;
}

export interface IPrompt {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly isDefault: boolean;
  readonly description?: string;
  readonly category?: PromptCategory;
}

export type PromptCategory =
  | 'suggestion'
  | 'chat_snippet'
  | 'context_menu'
  | 'notebook_snippet'
  | 'chat_system_prompt';

export interface ISuggestedEditsSettings {
  readonly autoRefresh: boolean;
  readonly debounceMs: number;
  readonly maxCellCharacters: number;
  readonly contextWindow: number;
  readonly openaiApiKey: string;
  readonly chatSystemPrompt: string;
}

export type SuggestionScanMode = 'context' | 'full';

export interface IReadonlyDiffSegment {
  readonly value: string;
  readonly type: 'added' | 'removed' | 'unchanged' | 'modified';
  readonly lineNumberOriginal?: number;
  readonly lineNumberNew?: number;
}
