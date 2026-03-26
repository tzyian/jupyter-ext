import type { JupyterFrontEnd, ILayoutRestorer } from '@jupyterlab/application';
import type { INotebookTracker } from '@jupyterlab/notebook';
import type { ICommandPalette } from '@jupyterlab/apputils';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';

import { SuggestedEditsController } from './sidebar/suggestions/suggestedEditsController';
import { defaultSettings } from './sidebar/utils/defaults';
import { SuggestedEditsSidebar } from './sidebar/suggestions/SuggestedEditsSidebar';
import { registerCommands } from './commands';
import {
  TelemetryService,
  NotebookTelemetryTracker,
  SidebarTelemetryTracker,
  ChatTelemetryTracker
} from './telemetry';
import { TelemetrySidebar } from './sidebar/dashboard/TelemetrySidebar';
import { ChatSidebar } from './sidebar/chat/ChatSidebar';
import { ChatController, IChatController } from './sidebar/chat/chatController';
import { ContextMenuSidebar } from './sidebar/contextMenu/ContextMenuSidebar';
import {
  CHAT_SIDEBAR_ID,
  CONTEXT_MENU_SIDEBAR_ID,
  SIDEBAR_PANEL_RANKS,
  SUGGESTIONS_SIDEBAR_ID,
  TELEMETRY_SIDEBAR_ID
} from './types';
import { loadSettings } from './utils/loadSettings';

/**
 * Registration result for the suggested edits sidebar.
 */
export interface ISuggestedEditsSidebarRegistration {
  readonly sidebar: SuggestedEditsSidebar;
  readonly chatSidebar: ChatSidebar;
  readonly contextMenuSidebar: ContextMenuSidebar;
  readonly controller: SuggestedEditsController;
  readonly chatController: IChatController;
  readonly telemetryService: TelemetryService;
  readonly notebookTracker: NotebookTelemetryTracker;
  readonly sidebarTracker: SidebarTelemetryTracker;
  readonly chatTracker: ChatTelemetryTracker;
  readonly telemetrySidebar: TelemetrySidebar;
}

export function registerSidebars(options: {
  pluginId: string;
  app: JupyterFrontEnd;
  tracker: INotebookTracker;
  restorer: ILayoutRestorer | null;
  settingRegistry: ISettingRegistry | null;
  palette: ICommandPalette | null;
}): ISuggestedEditsSidebarRegistration {
  const { pluginId, app, tracker, restorer, settingRegistry, palette } =
    options;

  // Suggestions
  const suggestionsSidebar = new SuggestedEditsSidebar();

  const controller = new SuggestedEditsController(
    tracker,
    suggestionsSidebar,
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
  const sidebarTracker = new SidebarTelemetryTracker(
    suggestionsSidebar,
    telemetryService
  );

  const telemetrySidebar = new TelemetrySidebar(telemetryService);

  const chatSidebar = new ChatSidebar();
  const chatController = new ChatController(chatSidebar, tracker);
  chatSidebar.setController(chatController);

  const chatTracker = new ChatTelemetryTracker(
    chatController,
    telemetryService
  );

  const contextMenuSidebar = new ContextMenuSidebar();

  registerCommands(
    app,
    suggestionsSidebar,
    telemetrySidebar,
    chatSidebar,
    chatController,
    contextMenuSidebar,
    tracker,
    palette
  );

  if (restorer) {
    restorer.add(suggestionsSidebar, SUGGESTIONS_SIDEBAR_ID);
    restorer.add(telemetrySidebar, TELEMETRY_SIDEBAR_ID);
    restorer.add(chatSidebar, CHAT_SIDEBAR_ID);
    restorer.add(contextMenuSidebar, CONTEXT_MENU_SIDEBAR_ID);
  }

  app.shell.add(suggestionsSidebar, 'left', {
    rank: SIDEBAR_PANEL_RANKS.suggestions
  });
  app.shell.add(telemetrySidebar, 'left', {
    rank: SIDEBAR_PANEL_RANKS.dashboard
  });
  app.shell.add(chatSidebar, 'left', {
    rank: SIDEBAR_PANEL_RANKS.chat
  });
  app.shell.add(contextMenuSidebar, 'left', {
    rank: SIDEBAR_PANEL_RANKS.contextMenus
  });

  void loadSettings(
    settingRegistry,
    controller,
    chatController,
    pluginId,
    suggestionsSidebar
  );

  return {
    sidebar: suggestionsSidebar,
    chatSidebar,
    contextMenuSidebar,
    controller,
    chatController,
    telemetryService,
    notebookTracker,
    sidebarTracker,
    chatTracker,
    telemetrySidebar
  };
}
