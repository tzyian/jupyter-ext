import { create } from 'zustand';
import { IPrompt } from '../types';

interface IPromptState {
  prompts: IPrompt[];
  setPrompts: (prompts: IPrompt[]) => void;
  addPrompt: (prompt: IPrompt) => void;
  updatePromptInStore: (prompt: IPrompt) => void;
  removePromptFromStore: (id: string) => void;
}

export const usePromptStore = create<IPromptState>(set => ({
  prompts: [],
  setPrompts: prompts => set({ prompts }),
  addPrompt: prompt =>
    set(state => ({
      prompts: [...state.prompts, prompt]
    })),
  updatePromptInStore: prompt =>
    set(state => ({
      prompts: state.prompts.map(p => (p.id === prompt.id ? prompt : p))
    })),
  removePromptFromStore: id =>
    set(state => ({
      prompts: state.prompts.filter(p => p.id !== id)
    }))
}));
