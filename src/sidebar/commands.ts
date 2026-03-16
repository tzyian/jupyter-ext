import type { JupyterFrontEnd } from '@jupyterlab/application';
import { SuggestedEditsSidebar } from './SuggestedEditsSidebar';
import type { SuggestedEditsController } from './suggestedEditsController';
import type { ChatSidebar } from './ChatSidebar';
import { Menu } from '@lumino/widgets';

export namespace CommandIDs {
  export const openSidebar = 'selenejs:open-suggested-edits';
  export const refresh = 'selenejs:refresh-suggested-edits';
  export const chatAboutThis = 'selenejs:chat-about-this';
}

export function registerCommands(
  app: JupyterFrontEnd,
  sidebar: SuggestedEditsSidebar,
  controller: SuggestedEditsController,
  chatSidebar: ChatSidebar
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
      label: args => (args['promptName'] as string) || 'Chat about this',
      caption: args => (args['promptDescription'] as string) || '',
      execute: async args => {
        const promptContent = args['promptContent'] as string;
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
      rank: 10
    });

    chatSidebar.setChatMenu(chatMenu);
  }
}
