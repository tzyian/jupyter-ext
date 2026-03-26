import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import { SuggestedEditsController } from '../sidebar/suggestions/suggestedEditsController';
import { defaultSettings } from '../sidebar/utils/defaults';
import type { ISuggestedEditsSettings } from '../sidebar/types';
import { IChatController } from '../sidebar/chat/chatController';

/**
 * Load settings from the setting registry.
 */
export async function loadSettings(
  registry: ISettingRegistry | null,
  controller: SuggestedEditsController,
  chatController: IChatController,
  pluginId: string,
): Promise<void> {
  const merged = defaultSettings();

  if (!registry) {
    controller.updateSettings(merged);
    chatController.setSettings(merged);
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
      chatController.setSettings(resolved);
    };

    settings.changed.connect(applySettings);
    applySettings();
  } catch (error) {
    console.error('Failed to load selenejs settings.', error);
    controller.updateSettings(merged);
    chatController.setSettings(merged);
  }
}
