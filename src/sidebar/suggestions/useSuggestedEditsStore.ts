import { create } from 'zustand';
import { ISuggestedEditsState, IResolvedSuggestion } from './types';

interface ISuggestedEditsActions {
  setStatus: (status: string) => void;
  setPaused: (isPaused: boolean) => void;
  setHasApiKey: (hasApiKey: boolean) => void;
  setLocalSuggestions: (suggestions: (IResolvedSuggestion | null)[]) => void;
  setGlobalSuggestion: (suggestion: IResolvedSuggestion | null) => void;
  setSelectedLocalPromptId: (id: string) => void;
  setSelectedGlobalPromptId: (id: string) => void;
  setView: (view: 'home' | 'settings') => void;
  addLocalSuggestion: (suggestion: IResolvedSuggestion) => void;
  dismissSuggestion: (suggestion: IResolvedSuggestion) => void;
}

/**
 * Zustand store for suggested edits state.
 */
export const useSuggestedEditsStore = create<
  ISuggestedEditsState & ISuggestedEditsActions
>(set => ({
  status: 'Waiting for notebook activity.',
  isPaused: false,
  hasApiKey: false,
  localSuggestions: [null, null],
  globalSuggestion: null,
  selectedLocalPromptId: 'default_local',
  selectedGlobalPromptId: 'default_global',
  view: 'home',

  setStatus: status => set({ status }),
  setPaused: isPaused => set({ isPaused }),
  setHasApiKey: hasApiKey => set({ hasApiKey }),
  setLocalSuggestions: localSuggestions => set({ localSuggestions }),
  setGlobalSuggestion: globalSuggestion => set({ globalSuggestion }),
  setSelectedLocalPromptId: selectedLocalPromptId =>
    set({ selectedLocalPromptId }),
  setSelectedGlobalPromptId: selectedGlobalPromptId =>
    set({ selectedGlobalPromptId }),
  setView: view => set({ view }),

  addLocalSuggestion: suggestion =>
    set(state => {
      const local = [...state.localSuggestions];
      local[1] = local[0];
      local[0] = suggestion;
      return { localSuggestions: local };
    }),

  dismissSuggestion: suggestion =>
    set(state => {
      if (state.globalSuggestion?.id === suggestion.id) {
        return { globalSuggestion: null };
      }
      const idx = state.localSuggestions.findIndex(
        s => s?.id === suggestion.id
      );
      if (idx !== -1) {
        const local = [...state.localSuggestions];
        local.splice(idx, 1);
        local.push(null);
        return { localSuggestions: local };
      }
      return state;
    })
}));
