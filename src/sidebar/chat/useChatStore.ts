import { create } from 'zustand';
import { IChatState, IChatMessage, IChatThread } from './types';
import { CHAT_VIEW_CHAT } from './constants';
import { IPrompt } from '../types';

interface IChatActions {
  setMessages: (messages: IChatMessage[]) => void;
  addMessage: (message: IChatMessage) => void;
  updateLastMessage: (patch: Partial<IChatMessage>) => void;
  setThreads: (threads: IChatThread[]) => void;
  setActiveThreadId: (id: string | null) => void;
  setThreadsLoaded: (loaded: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setView: (view: any) => void;
  setSelectedSnippetId: (id: string) => void;
  setSelectedSystemPromptId: (id: string) => void;
  setPrompts: (prompts: IPrompt[]) => void;
  setCellContext: (context: IChatState['cellContext']) => void;
  clearChat: () => void;
}

/**
 * Zustand store for chat feature state.
 */
export const useChatStore = create<IChatState & IChatActions>(set => ({
  messages: [],
  threads: [],
  activeThreadId: null,
  threadsLoaded: false,
  isStreaming: false,
  view: CHAT_VIEW_CHAT,
  selectedSnippetId: '__CREATE_NEW__',
  selectedSystemPromptId: 'default_chat_system',
  prompts: [],
  cellContext: null,
  settings: null,

  setMessages: messages => set({ messages }),
  addMessage: message =>
    set(state => ({ messages: [...state.messages, message] })),
  updateLastMessage: patch =>
    set(state => {
      const messages = [...state.messages];
      if (messages.length === 0) {
        return state;
      }
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        ...patch
      };
      return { messages };
    }),
  setThreads: threads => set({ threads }),
  setActiveThreadId: id => set({ activeThreadId: id }),
  setThreadsLoaded: loaded => set({ threadsLoaded: loaded }),
  setStreaming: streaming => set({ isStreaming: streaming }),
  setView: view => set({ view }),
  setSelectedSnippetId: id => set({ selectedSnippetId: id }),
  setSelectedSystemPromptId: id => set({ selectedSystemPromptId: id }),
  setPrompts: prompts => set({ prompts }),
  setCellContext: cellContext => set({ cellContext }),
  clearChat: () => set({ messages: [], isStreaming: false })
}));
