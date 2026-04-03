import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';
import { ICommandPalette } from '@jupyterlab/apputils';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { registerWordLineStatus } from './widgets/WordLineStatus';
import { registerSidebars } from './register';
import '../style/index.css';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'selenejs:plugin',
  description: 'A JupyterLab extension.',
  autoStart: true,
  requires: [INotebookTracker, IStatusBar],
  optional: [ISettingRegistry, ILayoutRestorer, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    statusBar: IStatusBar,
    settingRegistry: ISettingRegistry | null,
    restorer: ILayoutRestorer | null,
    palette: ICommandPalette | null
  ) => {
    console.log('JupyterLab extension selenejs is activated!');
    registerWordLineStatus(tracker, statusBar);

    registerSidebars({
      pluginId: plugin.id,
      app,
      tracker,
      restorer,
      settingRegistry,
      palette
    });
  }
};

export default plugin;
