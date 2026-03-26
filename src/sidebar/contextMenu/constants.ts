import type { PromptCategory } from '../types';

export const PROMPT_CATEGORY_CONTEXT_MENU = 'context_menu' as const;
export const PROMPT_CATEGORY_NOTEBOOK_SNIPPET = 'notebook_snippet' as const;

export type ContextMenuView =
  | typeof PROMPT_CATEGORY_CONTEXT_MENU
  | typeof PROMPT_CATEGORY_NOTEBOOK_SNIPPET;

export const CONTEXT_MENU_PROMPT_CATEGORIES = [
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET
] satisfies PromptCategory[];

export const CONTEXT_MENU_TITLE = 'Right-Click Menu Options';
export const NOTEBOOK_SNIPPET_TITLE = 'Notebook Insert Snippets';
export const CONTEXT_MENU_OPTION_LABEL = 'Context Menu LLM Prompts';
export const NOTEBOOK_SNIPPET_OPTION_LABEL = 'SelenePy Notebook Snippets';
export const CREATE_NEW_SNIPPET_LABEL = '+ Create New Snippet...';
export const SELECT_SNIPPET_LABEL = 'Select Snippet:';
