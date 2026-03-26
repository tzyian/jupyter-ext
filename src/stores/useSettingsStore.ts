import { create } from 'zustand';
import { ISuggestedEditsSettings } from '../sidebar/types';
import { defaultSettings } from '../sidebar/utils/defaults';

interface ISettingsState {
  settings: ISuggestedEditsSettings;
  setSettings: (settings: ISuggestedEditsSettings) => void;
  updateSettings: (patch: Partial<ISuggestedEditsSettings>) => void;
}

/**
 * Global store for application settings.
 * Synchronized with JupyterLab's ISettingRegistry via loadSettings.ts.
 */
export const useSettingsStore = create<ISettingsState>(set => ({
  settings: defaultSettings(),
  setSettings: settings => set({ settings }),
  updateSettings: patch =>
    set(state => ({
      settings: { ...state.settings, ...patch }
    }))
}));
