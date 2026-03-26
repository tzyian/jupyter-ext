/**
 * Root level constants and types for the SelenePy extension.
 */

export const SIDEBAR_PANEL_RANKS = {
  suggestions: 600,
  dashboard: 601,
  chat: 602,
  contextMenus: 603
} as const;

export const SUGGESTIONS_SIDEBAR_ID = 'selenejs-suggested-edits-sidebar';
export const TELEMETRY_SIDEBAR_ID = 'selenejs-telemetry-sidebar';
export const CONTEXT_MENU_SIDEBAR_ID = 'selenejs-context-menu-sidebar';
export const CHAT_SIDEBAR_ID = 'selenejs-chat-sidebar';
export namespace CommandIDs {
  export const openSuggestionsSidebar = 'selenejs:open-suggested-edits';
  export const openDashboard = 'selenejs:open-dashboard';
  export const openChatSidebar = 'selenejs:open-chat-sidebar';
  export const openContextMenuSidebar = 'selenejs:open-context-menu-sidebar';
  export const openContextMenuSnippetsSidebar =
    'selenejs:open-context-menu-snippets-sidebar';
  export const openContextMenuPromptsConfig =
    'selenejs:open-context-menu-prompts-config';
  export const openChatPromptsConfig = 'selenejs:open-chat-prompts-config';
  export const openNotebookSnippetsConfig =
    'selenejs:open-notebook-snippets-config';
  export const chatAboutThis = 'selenejs:chat-about-this';
  export const insertNotebookSnippet = 'selenejs:insert-notebook-snippet';
}
export namespace CommandArguments {
  export interface IPrompt {
    promptName?: string;
    promptDescription?: string;
    promptContent?: string;
  }
}
