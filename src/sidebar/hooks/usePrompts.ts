import { useState, useEffect, useCallback, useMemo } from 'react';
import { IPrompt, PromptCategory } from '../types';
import { fetchPrompts, savePrompt, deletePrompt } from '../api';
import { usePromptStore } from './usePromptStore';

export interface IUsePrompts {
  prompts: IPrompt[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatePrompt: (
    name: string,
    content: string,
    description: string,
    id: string,
    category?: PromptCategory
  ) => Promise<void>;
  createPrompt: (
    name: string,
    content: string,
    description: string,
    category?: PromptCategory
  ) => Promise<string | void>;
  removePrompt: (id: string) => Promise<void>;
}

export function usePrompts(
  categoryFilter?: PromptCategory | PromptCategory[]
): IUsePrompts {
  const {
    prompts: allPrompts,
    setPrompts,
    addPrompt,
    updatePromptInStore,
    removePromptFromStore
  } = usePromptStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedCategories = useMemo(() => {
    if (!categoryFilter) {
      return null;
    }
    return Array.isArray(categoryFilter)
      ? [...categoryFilter]
      : [categoryFilter];
  }, [categoryFilter]);

  const prompts = useMemo(() => {
    if (!normalizedCategories) {
      return allPrompts;
    }
    const categories = normalizedCategories;
    return allPrompts.filter(
      p => !!p.category && categories.includes(p.category)
    );
  }, [allPrompts, normalizedCategories]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchPrompts();
      setPrompts(all);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  }, [setPrompts]);

  useEffect(() => {
    if (allPrompts.length === 0) {
      void refresh();
    }
  }, [allPrompts.length, refresh]);

  const updatePrompt = async (
    name: string,
    content: string,
    description: string,
    id: string,
    category?: PromptCategory
  ) => {
    try {
      const p = await savePrompt(name, content, id, description, category);
      updatePromptInStore(p);
    } catch (err: any) {
      setError(err.message || 'Failed to update prompt');
      throw err;
    }
  };

  const createPrompt = async (
    name: string,
    content: string,
    description: string,
    category?: PromptCategory
  ): Promise<string | void> => {
    try {
      const p = await savePrompt(
        name,
        content,
        undefined,
        description,
        category
      );
      addPrompt(p);
      return p.id;
    } catch (err: any) {
      setError(err.message || 'Failed to create prompt');
      throw err;
    }
  };

  const removePrompt = async (id: string) => {
    try {
      await deletePrompt(id);
      removePromptFromStore(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete prompt');
      throw err;
    }
  };

  return {
    prompts,
    loading,
    error,
    refresh,
    updatePrompt,
    createPrompt,
    removePrompt
  };
}
