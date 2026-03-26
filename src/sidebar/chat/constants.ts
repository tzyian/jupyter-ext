import type { PromptCategory } from '../types';

export const PROMPT_CATEGORY_CHAT_SNIPPET =
  'chat_snippet' satisfies PromptCategory;
export const PROMPT_CATEGORY_CHAT_SYSTEM =
  'chat_system_prompt' satisfies PromptCategory;

export const CHAT_VIEW_CHAT = 'chat' as const;
export const CHAT_VIEW_SETTINGS = 'settings' as const;

export type ChatPromptManagerView =
  | typeof PROMPT_CATEGORY_CHAT_SNIPPET
  | typeof PROMPT_CATEGORY_CHAT_SYSTEM;

export type ChatSidebarView =
  | typeof CHAT_VIEW_CHAT
  | typeof PROMPT_CATEGORY_CHAT_SNIPPET
  | typeof CHAT_VIEW_SETTINGS
  | typeof PROMPT_CATEGORY_CHAT_SYSTEM;

export const CHAT_PROMPT_CATEGORIES = [
  PROMPT_CATEGORY_CHAT_SNIPPET,
  PROMPT_CATEGORY_CHAT_SYSTEM
] satisfies PromptCategory[];

export const CHAT_VIEW_SYSTEM_PROMPT_LABEL = 'Manage System Prompts';
export const CHAT_VIEW_SNIPPETS_LABEL = 'Manage Chat Snippets';
export const CHAT_SYSTEM_PROMPTS_TITLE = 'Chat System Prompts';
export const CHAT_SNIPPETS_TITLE = 'Reusable Chat Snippets';
export const CREATE_NEW_SYSTEM_PROMPT_LABEL = '➕ Create New System Prompt...';
export const SELECT_SNIPPET_LABEL = 'Select Snippet:';
