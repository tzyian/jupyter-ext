import type { JupyterFrontEnd, ILayoutRestorer } from '@jupyterlab/application';
import type { INotebookTracker } from '@jupyterlab/notebook';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  SuggestedEditsController,
  defaultSettings
} from './suggestedEditsController';
import { SuggestedEditsSidebar } from './suggestedEditsPanel';
import type { ISuggestedEditsSettings } from '../types';

export const SIDEBAR_ID = 'selenejs-suggested-edits-sidebar';

export interface ISuggestedEditsSidebarRegistration {
  readonly sidebar: SuggestedEditsSidebar;
  readonly controller: SuggestedEditsController;
}

export function registerSuggestedEditsSidebar(options: {
  pluginId: string;
  app: JupyterFrontEnd;
  tracker: INotebookTracker;
  restorer: ILayoutRestorer | null;
  settingRegistry: ISettingRegistry | null;
}): ISuggestedEditsSidebarRegistration {
  const { pluginId, app, tracker, restorer, settingRegistry } = options;

  const sidebar = new SuggestedEditsSidebar();
  sidebar.id = SIDEBAR_ID;
  sidebar.title.caption = 'LLM Suggested Edits';
  sidebar.title.iconClass = 'jp-NotebookIcon';

  const controller = new SuggestedEditsController(
    tracker,
    sidebar,
    defaultSettings()
  );

  registerCommands(app, sidebar, controller);

  if (restorer) {
    restorer.add(sidebar, SIDEBAR_ID);
  }

  app.shell.add(sidebar, 'left', { rank: 600 });

  void loadSettings(settingRegistry, controller, pluginId);

  return { sidebar, controller };
}

namespace CommandIDs {
  export const openSidebar = 'selenejs:open-suggested-edits';
  export const refresh = 'selenejs:refresh-suggested-edits';
}

function registerCommands(
  app: JupyterFrontEnd,
  sidebar: SuggestedEditsSidebar,
  controller: SuggestedEditsController
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
}

async function loadSettings(
  registry: ISettingRegistry | null,
  controller: SuggestedEditsController,
  pluginId: string
): Promise<void> {
  const merged = defaultSettings();

  if (!registry) {
    controller.updateSettings(merged);
    return;
  }

  try {
    const settings = await registry.load(pluginId);

    const applySettings = () => {
      const composite = settings.composite as Partial<ISuggestedEditsSettings>;
      const resolved: ISuggestedEditsSettings = {
        ...defaultSettings(),
        ...composite
      };
      controller.updateSettings(resolved);
    };

    settings.changed.connect(applySettings);
    applySettings();
  } catch (error) {
    console.error('Failed to load selenejs settings.', error);
    controller.updateSettings(merged);
  }
}
