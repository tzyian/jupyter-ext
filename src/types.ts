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

export type SuggestionContextType = 'local' | 'global';

export interface ISuggestion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cellIndex: number;
  readonly replacementSource: string;
  readonly rationale?: string;
  readonly contextType?: SuggestionContextType;
  readonly notebookPath?: string;
}

export type SuggestionStreamEvent =
  | {
      readonly type: 'status';
      readonly phase: 'started' | 'complete';
    }
  | {
      readonly type: 'suggestion';
      readonly payload: ISuggestion;
    }
  | {
      readonly type: 'info';
      readonly message: string;
    };

export interface IPrompt {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly isDefault: boolean;
  readonly description?: string;
  readonly category?:
    | 'suggestion'
    | 'chat'
    | 'chat_snippet'
    | 'context_menu'
    | 'chat_system_prompt';
}

export interface ISuggestedEditsSettings {
  readonly autoRefresh: boolean;
  readonly debounceMs: number;
  readonly maxCellCharacters: number;
  readonly contextWindow: number;
  readonly openaiApiKey: string;
  readonly chatSystemPrompt: string;
}

export interface ISuggestionRequest {
  readonly snapshot: INotebookSnapshot;
  readonly settings: ISuggestedEditsSettings;
  readonly mode: SuggestionScanMode;
  readonly promptId: string;
}

export type SuggestionScanMode = 'context' | 'full';

export interface IResolvedSuggestion extends ISuggestion {
  readonly originalSource: string;
  readonly diffSegments: IReadonlyDiffSegment[];
}

export interface IReadonlyDiffSegment {
  readonly value: string;
  readonly type: 'added' | 'removed' | 'unchanged' | 'modified';
  readonly lineNumberOriginal?: number;
  readonly lineNumberNew?: number;
}

export interface IChatMessage {
  readonly id: string;
  readonly role: 'user' | 'ai';
  readonly content: string;
  readonly threadId?: string;
  readonly timestamp?: number;
}

export interface IChatThread {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
  readonly lastResponseDuration?: number;
}

export type ChatStreamEvent =
  | {
      readonly type: 'status';
      readonly phase: 'started' | 'complete';
    }
  | {
      readonly type: 'chunk';
      readonly content: string;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    }
  | {
      readonly type: 'metrics';
      readonly tokensUsed: number;
      readonly tokensSent: number;
      readonly messagesSent: number;
    };
