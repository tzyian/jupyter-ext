import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ChatSidebar } from '../sidebar/chat/ChatSidebar';
import { SuggestedEditsController } from '../sidebar/suggestions/suggestedEditsController';
import { SuggestedEditsSidebar } from '../sidebar/suggestions/SuggestedEditsSidebar';
import { defaultSettings } from '../sidebar/utils/defaults';
import type { ISuggestedEditsSettings } from '../sidebar/types';

/**
 * Load settings from the setting registry.
 */
export async function loadSettings(
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
