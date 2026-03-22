import { useState, useEffect, useCallback, useMemo } from 'react';
import { IPrompt, PromptCategory } from '../../types';
import { fetchPrompts, savePrompt, deletePrompt } from '../api';

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
  const [prompts, setPrompts] = useState<IPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizedCategories = useMemo(() => {
    if (!categoryFilter) {
      return null;
    }
    return Array.isArray(categoryFilter)
      ? [...categoryFilter]
      : [categoryFilter];
  }, [categoryFilter]);

  const categoryKey = useMemo(() => {
    if (!normalizedCategories) {
      return '__ALL__';
    }
    return normalizedCategories.join('|');
  }, [normalizedCategories]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchPrompts();
      if (normalizedCategories) {
        const categories = normalizedCategories;
        setPrompts(
          all.filter(p => {
            if (p.category && categories.includes(p.category)) {
              return true;
            }
            // Special case: 'chat' items often used in context menus
            if (
              p.category === 'chat' &&
              (categories.includes('context_menu') ||
                categories.includes('chat_snippet'))
            ) {
              return true;
            }
            return false;
          })
        );
      } else {
        setPrompts(all);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  }, [categoryKey, normalizedCategories]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updatePrompt = async (
    name: string,
    content: string,
    description: string,
    id: string,
    category?: PromptCategory
  ) => {
    try {
      await savePrompt(name, content, id, description, category);
      await refresh();
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
      await refresh();
      return p.id;
    } catch (err: any) {
      setError(err.message || 'Failed to create prompt');
      throw err;
    }
  };

  const removePrompt = async (id: string) => {
    try {
      await deletePrompt(id);
      await refresh();
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
