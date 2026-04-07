import type { JupyterFrontEnd } from '@jupyterlab/application';
import { SuggestedEditsSidebar } from './sidebar/suggestions/SuggestedEditsSidebar';
import type { ChatSidebar } from './sidebar/chat/ChatSidebar';
import { IChatController } from './sidebar/chat/chatController';
import type { ContextMenuSidebar } from './sidebar/contextMenu/ContextMenuSidebar';
import type { TelemetrySidebar } from './sidebar/dashboard/TelemetrySidebar';
import { Menu, type Widget } from '@lumino/widgets';
import type { INotebookTracker } from '@jupyterlab/notebook';
import type { ICommandPalette } from '@jupyterlab/apputils';
import { CommandArguments, SIDEBAR_PANEL_RANKS } from './types';
import { PROMPT_CATEGORY_CHAT_SYSTEM } from './sidebar/chat/constants';
import {
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET
} from './sidebar/contextMenu/constants';
import { ContextMenuController } from './sidebar/contextMenu/ContextMenuController';
import { CommandIDs } from './types';

const PALETTE_CATEGORY = 'SelenePy';

function openPanel(app: JupyterFrontEnd, panel: Widget, rank: number): void {
  if (!panel.isAttached) {
    app.shell.add(panel, 'left', { rank });
  }
  app.shell.activateById(panel.id);
}

export function registerCommands(
  app: JupyterFrontEnd,
  suggestionsSidebar: SuggestedEditsSidebar,
  telemetrySidebar: TelemetrySidebar,
  chatSidebar: ChatSidebar,
  chatController: IChatController,
  contextMenuSidebar: ContextMenuSidebar,
  tracker: INotebookTracker,
  palette: ICommandPalette | null = null
): void {
  if (!app.commands.hasCommand(CommandIDs.openSuggestionsSidebar)) {
    app.commands.addCommand(CommandIDs.openSuggestionsSidebar, {
      label: 'Show Suggested Edits',
      isEnabled: () => !suggestionsSidebar.isDisposed,
      execute: () => {
        openPanel(app, suggestionsSidebar, SIDEBAR_PANEL_RANKS.suggestions);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openDashboard)) {
    app.commands.addCommand(CommandIDs.openDashboard, {
      label: 'Show Dashboard',
      isEnabled: () => !telemetrySidebar.isDisposed,
      execute: () => {
        openPanel(app, telemetrySidebar, SIDEBAR_PANEL_RANKS.dashboard);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openChatSidebar)) {
    app.commands.addCommand(CommandIDs.openChatSidebar, {
      label: 'Show Chat',
      isEnabled: () => !chatSidebar.isDisposed,
      execute: () => {
        openPanel(app, chatSidebar, SIDEBAR_PANEL_RANKS.chat);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openContextMenuSidebar)) {
    app.commands.addCommand(CommandIDs.openContextMenuSidebar, {
      label: 'Show Context Menus',
      isEnabled: () => !contextMenuSidebar.isDisposed,
      execute: () => {
        openPanel(app, contextMenuSidebar, SIDEBAR_PANEL_RANKS.contextMenus);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openChatPromptsConfig)) {
    app.commands.addCommand(CommandIDs.openChatPromptsConfig, {
      label: 'Configure Chat Prompts',
      isEnabled: () => !chatSidebar.isDisposed,
      execute: () => {
        openPanel(app, chatSidebar, SIDEBAR_PANEL_RANKS.chat);
        chatController.openPromptManager(PROMPT_CATEGORY_CHAT_SYSTEM);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openNotebookSnippetsConfig)) {
    app.commands.addCommand(CommandIDs.openNotebookSnippetsConfig, {
      label: 'Configure Context Menu Snippets',
      isEnabled: () => !contextMenuSidebar.isDisposed,
      execute: () => {
        openPanel(app, contextMenuSidebar, SIDEBAR_PANEL_RANKS.contextMenus);
        contextMenuSidebar.openPromptManager(PROMPT_CATEGORY_CONTEXT_MENU);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openContextMenuPromptsConfig)) {
    app.commands.addCommand(CommandIDs.openContextMenuPromptsConfig, {
      label: 'Configure Context Menu Prompts',
      isEnabled: () => !contextMenuSidebar.isDisposed,
      execute: () => {
        openPanel(app, contextMenuSidebar, SIDEBAR_PANEL_RANKS.contextMenus);
        contextMenuSidebar.openPromptManager(PROMPT_CATEGORY_CONTEXT_MENU);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.openContextMenuSnippetsSidebar)) {
    app.commands.addCommand(CommandIDs.openContextMenuSnippetsSidebar, {
      label: 'Show Context Menu Snippets',
      isEnabled: () => !contextMenuSidebar.isDisposed,
      execute: () => {
        openPanel(app, contextMenuSidebar, SIDEBAR_PANEL_RANKS.contextMenus);
        contextMenuSidebar.openPromptManager(PROMPT_CATEGORY_NOTEBOOK_SNIPPET);
      }
    });
  }

  if (!app.commands.hasCommand(CommandIDs.chatAboutThis)) {
    app.commands.addCommand(CommandIDs.chatAboutThis, {
      label: args => {
        const typed = args as CommandArguments.IPrompt;
        return typed.promptName || 'Chat about this';
      },
      caption: args => {
        const typed = args as CommandArguments.IPrompt;
        return typed.promptDescription || '';
      },
      execute: async args => {
        const typed = args as CommandArguments.IPrompt;
        const promptContent = typed.promptContent;
        if (!promptContent) {
          return;
        }

        openPanel(app, chatSidebar, SIDEBAR_PANEL_RANKS.chat);

        await chatController.executeContextMenuPrompt(promptContent);
      }
    });

    const chatMenu = new Menu({ commands: app.commands });
    chatMenu.title.label = 'SelenePy Chat Prompts';
    chatMenu.title.iconClass = 'jp-CodeConsoleIcon';

    // Group Selene context-menu entries as one section in the main menu.
    app.contextMenu.addItem({
      type: 'separator',
      selector: '.jp-Cell',
      rank: 10.9
    });

    app.contextMenu.addItem({
      type: 'submenu',
      submenu: chatMenu,
      selector: '.jp-Cell',
      rank: 11
    });

    const snippetMenu = new Menu({ commands: app.commands });
    snippetMenu.title.label = 'SelenePy Notebook Snippets';
    snippetMenu.title.iconClass = 'jp-CodeConsoleIcon';

    app.contextMenu.addItem({
      type: 'submenu',
      submenu: snippetMenu,
      selector: '.jp-Cell',
      rank: 11.01
    });

    app.contextMenu.addItem({
      type: 'separator',
      selector: '.jp-Cell',
      rank: 11.1
    });

    const contextMenuController = new ContextMenuController(
      chatMenu,
      snippetMenu
    );
    contextMenuSidebar.promptsChanged.connect((_, prompts) => {
      contextMenuController.onPromptsChanged(prompts);
    });
  }

  if (!app.commands.hasCommand(CommandIDs.insertNotebookSnippet)) {
    app.commands.addCommand(CommandIDs.insertNotebookSnippet, {
      label: args => {
        const typed = args as CommandArguments.IPrompt;
        return typed.promptName || 'Insert Snippet';
      },
      caption: args => {
        const typed = args as CommandArguments.IPrompt;
        return typed.promptDescription || '';
      },
      execute: args => {
        const typed = args as CommandArguments.IPrompt;
        const promptContent = typed.promptContent;
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

  if (palette) {
    palette.addItem({
      command: CommandIDs.openSuggestionsSidebar,
      category: PALETTE_CATEGORY
    });
    palette.addItem({
      command: CommandIDs.openDashboard,
      category: PALETTE_CATEGORY
    });
    palette.addItem({
      command: CommandIDs.openChatSidebar,
      category: PALETTE_CATEGORY
    });
    palette.addItem({
      command: CommandIDs.openContextMenuSidebar,
      category: PALETTE_CATEGORY
    });
  }
}
