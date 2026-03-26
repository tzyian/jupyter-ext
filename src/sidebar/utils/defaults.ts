import type { ISuggestedEditsSettings } from '../types';

/**
 * Get the default settings for the suggested edits extension.
 */
export function defaultSettings(): ISuggestedEditsSettings {
  return {
    autoRefresh: true,
    debounceMs: 10000,
    maxCellCharacters: 3000,
    contextWindow: 3,
    openaiApiKey: '',
    chatSystemPrompt: ''
  };
}
