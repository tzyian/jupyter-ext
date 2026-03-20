import type { JupyterFrontEnd, ILayoutRestorer } from '@jupyterlab/application';
import type { INotebookTracker } from '@jupyterlab/notebook';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';

import { SuggestedEditsController } from './suggestedEditsController';
import { defaultSettings } from './utils/defaults';
import { SuggestedEditsSidebar } from './SuggestedEditsSidebar';
import { registerCommands } from './commands';
import type { ISuggestedEditsSettings } from '../types';
import {
  TelemetryService,
  NotebookTelemetryTracker,
  SidebarTelemetryTracker,
  ChatTelemetryTracker
} from '../telemetry';
import { TelemetrySidebar } from './TelemetrySidebar';
import { ChatSidebar } from './ChatSidebar';

export const SIDEBAR_ID = 'selenejs-suggested-edits-sidebar';
export const CHAT_SIDEBAR_ID = 'selenejs-chat-sidebar';

/**
 * Registration result for the suggested edits sidebar.
 */
export interface ISuggestedEditsSidebarRegistration {
  readonly sidebar: SuggestedEditsSidebar;
  readonly chatSidebar: ChatSidebar;
  readonly controller: SuggestedEditsController;
  readonly telemetryService: TelemetryService;
  readonly notebookTracker: NotebookTelemetryTracker;
  readonly sidebarTracker: SidebarTelemetryTracker;
  readonly chatTracker: ChatTelemetryTracker;
  readonly telemetrySidebar: TelemetrySidebar;
}

/**
 * Register the suggested edits sidebar with the JupyterLab application.
 */
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
  sidebar.title.label = 'Suggestions';
  sidebar.title.caption = 'LLM Suggested Edits';

  const controller = new SuggestedEditsController(
    tracker,
    sidebar,
    defaultSettings()
  );

  // Initialize telemetry system
  const telemetryService = new TelemetryService();
  const notebookTracker = new NotebookTelemetryTracker(
    tracker,
    telemetryService,
    app.serviceManager.contents,
    app
  );
  const sidebarTracker = new SidebarTelemetryTracker(sidebar, telemetryService);

  const telemetrySidebar = new TelemetrySidebar(telemetryService);
  telemetrySidebar.id = 'selenejs-telemetry-sidebar';
  telemetrySidebar.title.label = 'Dashboard';
  telemetrySidebar.title.caption = 'Productivity Dashboard';
  telemetrySidebar.title.iconClass = 'jp-SpreadsheetIcon';

  const chatSidebar = new ChatSidebar(tracker);
  const chatTracker = new ChatTelemetryTracker(chatSidebar, telemetryService);

  registerCommands(app, sidebar, controller, chatSidebar);

  if (restorer) {
    restorer.add(sidebar, SIDEBAR_ID);
    restorer.add(telemetrySidebar, 'selenejs-telemetry-sidebar');
    restorer.add(chatSidebar, CHAT_SIDEBAR_ID);
  }

  app.shell.add(sidebar, 'left', { rank: 600 });
  app.shell.add(telemetrySidebar, 'left', { rank: 601 });
  app.shell.add(chatSidebar, 'left', { rank: 602 });

  void loadSettings(
    settingRegistry,
    controller,
    pluginId,
    sidebar,
    chatSidebar
  );

  return {
    sidebar,
    chatSidebar,
    controller,
    telemetryService,
    notebookTracker,
    sidebarTracker,
    chatTracker,
    telemetrySidebar
  };
}

/**
 * Load settings from the setting registry.
 */
async function loadSettings(
  registry: ISettingRegistry | null,
  controller: SuggestedEditsController,
  pluginId: string,
  sidebar: SuggestedEditsSidebar,
  chatSidebar: ChatSidebar
): Promise<void> {
  const merged = defaultSettings();

  if (!registry) {
    controller.updateSettings(merged);
    sidebar.setHasApiKey(!!merged.openaiApiKey);
    chatSidebar.setSettings(merged);
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
      sidebar.setHasApiKey(!!resolved.openaiApiKey);
      chatSidebar.setSettings(resolved);
    };

    settings.changed.connect(applySettings);
    applySettings();
  } catch (error) {
    console.error('Failed to load selenejs settings.', error);
    controller.updateSettings(merged);
    sidebar.setHasApiKey(!!merged.openaiApiKey);
    chatSidebar.setSettings(merged);
  }
}
