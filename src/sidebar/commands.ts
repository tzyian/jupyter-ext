import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { SuggestedEditsSidebar } from './suggestions/SuggestedEditsSidebar';
import type { SuggestedEditsController } from './suggestions/suggestedEditsController';
import type { ChatSidebar } from './chat/components/ChatSidebar';
import type { ContextMenuSidebar } from './contextMenu/ContextMenuSidebar';
import { Menu } from '@lumino/widgets';
import type { INotebookTracker } from '@jupyterlab/notebook';
import {
  NOTEBOOK_SNIPPET_OPTION_LABEL,
  PROMPT_CATEGORY_CHAT_SYSTEM,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET
} from './constants';

export namespace CommandIDs {
  export const openSidebar = 'selenejs:open-suggested-edits';
  export const refresh = 'selenejs:refresh-suggested-edits';
  export const chatAboutThis = 'selenejs:chat-about-this';
  export const insertNotebookSnippet = 'selenejs:insert-notebook-snippet';
  export const manageChatPrompts = 'selenejs:manage-chat-prompts';
  export const manageNotebookSnippets = 'selenejs:manage-notebook-snippets';
}

type PromptArgKey = 'promptName' | 'promptDescription' | 'promptContent';

function getStringArg(
  args: ReadonlyPartialJSONObject,
  key: PromptArgKey
): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

export function registerCommands(
  app: JupyterFrontEnd,
  sidebar: SuggestedEditsSidebar,
  controller: SuggestedEditsController,
  chatSidebar: ChatSidebar,
  contextMenuSidebar: ContextMenuSidebar,
  tracker: INotebookTracker
): void {
  if (!app.commands.hasCommand(CommandIDs.openSidebar)) {
    app.commands.addCommand(CommandIDs.openSidebar, {
      label: 'Show Suggested Edits',
      isEnabled: () => !sidebar.isDisposed,
      execute: () => {
        if (!sidebar.isAttached) {
          app.shell.add(sidebar, 'left', { rank: 600 });
        }
        app.shell.activateById(sidebar.id);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.refresh)) {
    app.commands.addCommand(CommandIDs.refresh, {
      label: 'Refresh Suggested Edits',
      isEnabled: () => !sidebar.isDisposed,
      execute: () => {
        void controller.refresh();
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.chatAboutThis)) {
    app.commands.addCommand(CommandIDs.chatAboutThis, {
      label: args => getStringArg(args, 'promptName') || 'Chat about this',
      caption: args => getStringArg(args, 'promptDescription') || '',
      execute: async args => {
        const promptContent = getStringArg(args, 'promptContent');
        if (!promptContent) {
          return;
        }

        if (!chatSidebar.isAttached) {
          app.shell.add(chatSidebar, 'left', { rank: 602 });
        }
        app.shell.activateById(chatSidebar.id);

        await chatSidebar.executeContextMenuPrompt(promptContent);
      }
    });

    const chatMenu = new Menu({ commands: app.commands });
    chatMenu.title.label = 'SeleneChat';
    chatMenu.title.iconClass = 'jp-CodeConsoleIcon';

    app.contextMenu.addItem({
      type: 'submenu',
      submenu: chatMenu,
      selector: '.jp-Cell',
      rank: 11
    });

    const snippetMenu = new Menu({ commands: app.commands });
    snippetMenu.title.label = NOTEBOOK_SNIPPET_OPTION_LABEL;
    snippetMenu.title.iconClass = 'jp-CodeConsoleIcon';

    app.contextMenu.addItem({
      type: 'submenu',
      submenu: snippetMenu,
      selector: '.jp-Cell',
      rank: 12
    });

    contextMenuSidebar.setMenus(chatMenu, snippetMenu);

    // Add Manage commands to the end of the menus
    chatMenu.addItem({ type: 'separator' });
    chatMenu.addItem({ command: CommandIDs.manageChatPrompts });

    snippetMenu.addItem({ type: 'separator' });
    snippetMenu.addItem({ command: CommandIDs.manageNotebookSnippets });
  }

  if (!app.commands.hasCommand(CommandIDs.manageChatPrompts)) {
    app.commands.addCommand(CommandIDs.manageChatPrompts, {
      label: 'Manage Chat Prompts',
      execute: () => {
        if (!chatSidebar.isAttached) {
          app.shell.add(chatSidebar, 'left', { rank: 602 });
        }
        app.shell.activateById(chatSidebar.id);
        chatSidebar.openPromptManager(PROMPT_CATEGORY_CHAT_SYSTEM);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.manageNotebookSnippets)) {
    app.commands.addCommand(CommandIDs.manageNotebookSnippets, {
      label: 'Manage Snippets',
      execute: () => {
        if (!contextMenuSidebar.isAttached) {
          app.shell.add(contextMenuSidebar, 'left', { rank: 603 });
        }
        app.shell.activateById(contextMenuSidebar.id);
        contextMenuSidebar.openPromptManager(PROMPT_CATEGORY_NOTEBOOK_SNIPPET);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.insertNotebookSnippet)) {
    app.commands.addCommand(CommandIDs.insertNotebookSnippet, {
      label: args => getStringArg(args, 'promptName') || 'Insert Snippet',
      caption: args => getStringArg(args, 'promptDescription') || '',
      execute: args => {
        const promptContent = getStringArg(args, 'promptContent');
        if (!promptContent) {
          return;
        }

        const activeWidget = tracker.currentWidget;
        if (!activeWidget) {
          return;
        }

        const activeCell = activeWidget.content.activeCell;
        if (!activeCell || !activeCell.editor) {
          return;
        }

        activeCell.editor.replaceSelection?.(promptContent);
      }
    });
  }
}
