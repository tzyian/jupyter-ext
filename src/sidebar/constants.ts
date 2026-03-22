import type { PromptCategory } from '../types';

export const PROMPT_CATEGORY_CHAT_SNIPPET =
  'chat_snippet' satisfies PromptCategory;
export const PROMPT_CATEGORY_CHAT_SYSTEM =
  'chat_system_prompt' satisfies PromptCategory;
export const PROMPT_CATEGORY_CONTEXT_MENU =
  'context_menu' satisfies PromptCategory;
export const PROMPT_CATEGORY_NOTEBOOK_SNIPPET =
  'notebook_snippet' satisfies PromptCategory;

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

export type ContextMenuView =
  | typeof PROMPT_CATEGORY_CONTEXT_MENU
  | typeof PROMPT_CATEGORY_NOTEBOOK_SNIPPET;

export const CONTEXT_MENU_PROMPT_CATEGORIES = [
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET
] satisfies PromptCategory[];

export const CHAT_PROMPT_CATEGORIES = [
  PROMPT_CATEGORY_CHAT_SNIPPET,
  PROMPT_CATEGORY_CHAT_SYSTEM
] satisfies PromptCategory[];

export const CHAT_VIEW_SYSTEM_PROMPT_LABEL = 'Manage System Prompts';
export const CHAT_VIEW_SNIPPETS_LABEL = 'Manage Chat Snippets';
export const CHAT_SYSTEM_PROMPTS_TITLE = 'Chat System Prompts';
export const CHAT_SNIPPETS_TITLE = 'Reusable Chat Snippets';
export const CREATE_NEW_SYSTEM_PROMPT_LABEL = '➕ Create New System Prompt...';

export const CONTEXT_MENU_TITLE = 'Right-Click Menu Options';
export const NOTEBOOK_SNIPPET_TITLE = 'Notebook Insert Snippets';
export const CONTEXT_MENU_OPTION_LABEL = 'Context Menu LLM Prompts';
export const NOTEBOOK_SNIPPET_OPTION_LABEL = 'SelenePy Notebook Snippets';
export const CREATE_NEW_SNIPPET_LABEL = '+ Create New Snippet...';
export const SELECT_SNIPPET_LABEL = 'Select Snippet:';
