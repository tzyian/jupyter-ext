import { IReadonlyDiffSegment } from '../types';

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

export interface IResolvedSuggestion extends ISuggestion {
  readonly originalSource: string;
  readonly diffSegments: IReadonlyDiffSegment[];
}
