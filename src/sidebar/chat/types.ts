export type ToolInput = string | Record<string, unknown>;

export interface IToolCall {
  readonly name: string;
  readonly input: ToolInput;
  readonly status: 'active' | 'done';
}

export interface IChatThoughts {
  readonly agent: string;
  readonly content: string;
}

export interface IChatMessage {
  readonly id: string;
  readonly role: 'user' | 'ai';
  readonly content: string;
  readonly threadId?: string;
  readonly timestamp?: number;
  readonly thoughts?: IChatThoughts[];
  readonly toolCalls?: IToolCall[];
}

export type IChatThoughtList = IChatThoughts[] | undefined;
export type IChatToolCallList = IToolCall[] | undefined;

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
    }
  | {
      readonly type: 'intermediate_chunk';
      readonly agent: string;
      readonly content: string;
    }
  | {
      readonly type: 'tool_call';
      readonly name: string;
      readonly input: ToolInput;
    }
  | {
      readonly type: 'tool_result';
      readonly name: string;
      readonly status: 'done';
    };
