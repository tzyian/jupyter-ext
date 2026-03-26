import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import { defaultSettings } from '../sidebar/utils/defaults';
import type { ISuggestedEditsSettings } from '../sidebar/types';
import { useSettingsStore } from '../stores/useSettingsStore';

/**
 * Load settings from the setting registry and sync to Zustand store.
 */
export async function loadSettings(
  registry: ISettingRegistry | null,
  pluginId: string
): Promise<void> {
  const settingsStore = useSettingsStore.getState();
  const merged = defaultSettings();

  if (!registry) {
    settingsStore.setSettings(merged);
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
      settingsStore.setSettings(resolved);
    };

    settings.changed.connect(applySettings);
    applySettings();
  } catch (error) {
    console.error('Failed to load selenejs settings.', error);
    settingsStore.setSettings(merged);
  }
}
