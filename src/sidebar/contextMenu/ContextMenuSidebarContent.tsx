import React, { useMemo, useEffect } from 'react';
import { SidebarLayout } from '../components/SidebarLayout';
import { PromptManagerView } from '../components/PromptManagerView';
import type { IPrompt, PromptCategory } from '../types';
import { usePrompts } from '../hooks/usePrompts';
import {
  CONTEXT_MENU_OPTION_LABEL,
  CONTEXT_MENU_PROMPT_CATEGORIES,
  CONTEXT_MENU_TITLE,
  CREATE_NEW_SNIPPET_LABEL,
  NOTEBOOK_SNIPPET_OPTION_LABEL,
  NOTEBOOK_SNIPPET_TITLE,
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET,
  SELECT_SNIPPET_LABEL,
  type ContextMenuView
} from './constants';

const VIEW_OPTIONS: Array<{ value: ContextMenuView; label: string }> = [
  { value: PROMPT_CATEGORY_CONTEXT_MENU, label: CONTEXT_MENU_OPTION_LABEL },
  {
    value: PROMPT_CATEGORY_NOTEBOOK_SNIPPET,
    label: NOTEBOOK_SNIPPET_OPTION_LABEL
  }
];

export interface IContextMenuSidebarContentProps {
  view: ContextMenuView;
  selectedContextMenuId: string;
  selectedNotebookSnippetId: string;
  onViewChange: (view: ContextMenuView) => void;
  onSelectContextMenu: (id: string) => void;
  onSelectNotebookSnippet: (id: string) => void;
  onPromptsChanged: (prompts: IPrompt[]) => void;
}

export const ContextMenuSidebarContent: React.FC<
  IContextMenuSidebarContentProps
> = props => {
  const categories = useMemo<PromptCategory[]>(
    () => CONTEXT_MENU_PROMPT_CATEGORIES,
    []
  );

  const { prompts } = usePrompts(categories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  return (
    <SidebarLayout
      view={props.view}
      onViewChange={val => props.onViewChange(val as ContextMenuView)}
      options={VIEW_OPTIONS}
    >
      {props.view === PROMPT_CATEGORY_CONTEXT_MENU && (
        <PromptManagerView
          title={CONTEXT_MENU_TITLE}
          category={PROMPT_CATEGORY_CONTEXT_MENU}
          selectedPromptId={props.selectedContextMenuId}
          onSelectPrompt={props.onSelectContextMenu}
        />
      )}

      {props.view === PROMPT_CATEGORY_NOTEBOOK_SNIPPET && (
        <PromptManagerView
          title={NOTEBOOK_SNIPPET_TITLE}
          category={PROMPT_CATEGORY_NOTEBOOK_SNIPPET}
          selectedPromptId={props.selectedNotebookSnippetId}
          onSelectPrompt={props.onSelectNotebookSnippet}
          showDescription={false}
          createNewLabel={CREATE_NEW_SNIPPET_LABEL}
          selectLabel={SELECT_SNIPPET_LABEL}
        />
      )}
    </SidebarLayout>
  );
};
