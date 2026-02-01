import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { registerWordLineStatus } from './widgets/wordlinestatus';
import { registerSuggestedEditsSidebar } from './sidebar/register';
import '../style/index.css';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'selenejs:plugin',
  description: 'A JupyterLab extension.',
  autoStart: true,
  requires: [INotebookTracker, IStatusBar],
  optional: [ISettingRegistry, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    statusBar: IStatusBar,
    settingRegistry: ISettingRegistry | null,
    restorer: ILayoutRestorer | null
  ) => {
    console.log('JupyterLab extension selenejs is activated!');
    registerWordLineStatus(tracker, statusBar);

    registerSuggestedEditsSidebar({
      pluginId: plugin.id,
      app,
      tracker,
      restorer,
      settingRegistry
    });
  }
};

export default plugin;
