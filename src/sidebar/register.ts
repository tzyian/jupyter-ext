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
  SidebarTelemetryTracker
} from '../telemetry';
import { TelemetrySidebar } from './TelemetrySidebar';

export const SIDEBAR_ID = 'selenejs-suggested-edits-sidebar';

/**
 * Registration result for the suggested edits sidebar.
 */
export interface ISuggestedEditsSidebarRegistration {
  readonly sidebar: SuggestedEditsSidebar;
  readonly controller: SuggestedEditsController;
  readonly telemetryService: TelemetryService;
  readonly notebookTracker: NotebookTelemetryTracker;
  readonly sidebarTracker: SidebarTelemetryTracker;
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
    telemetryService
  );
  const sidebarTracker = new SidebarTelemetryTracker(sidebar, telemetryService);

  // Create telemetry dashboard sidebar
  const telemetrySidebar = new TelemetrySidebar(telemetryService);
  telemetrySidebar.id = 'selenejs-telemetry-sidebar';
  telemetrySidebar.title.label = 'Dashboard';
  telemetrySidebar.title.caption = 'Productivity Dashboard';
  telemetrySidebar.title.iconClass = 'jp-SpreadsheetIcon';

  registerCommands(app, sidebar, controller);

  if (restorer) {
    restorer.add(sidebar, SIDEBAR_ID);
    restorer.add(telemetrySidebar, 'selenejs-telemetry-sidebar');
  }

  app.shell.add(sidebar, 'left', { rank: 600 });
  app.shell.add(telemetrySidebar, 'left', { rank: 601 });

  void loadSettings(settingRegistry, controller, pluginId);

  return {
    sidebar,
    controller,
    telemetryService,
    notebookTracker,
    sidebarTracker,
    telemetrySidebar
  };
}

/**
 * Load settings from the setting registry.
 */
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
