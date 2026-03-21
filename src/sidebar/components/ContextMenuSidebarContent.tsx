import React, { useMemo, useEffect } from 'react';
import { SidebarLayout } from './common/SidebarLayout';
import { PromptManagerView } from './common/PromptManagerView';
import type { IPrompt } from '../../types';
import { usePrompts } from '../utils/usePrompts';

export interface IContextMenuSidebarContentProps {
  view: 'context_menu' | 'notebook_snippet';
  selectedContextMenuId: string;
  selectedNotebookSnippetId: string;
  onViewChange: (view: 'context_menu' | 'notebook_snippet') => void;
  onSelectContextMenu: (id: string) => void;
  onSelectNotebookSnippet: (id: string) => void;
  onPromptsChanged: (prompts: IPrompt[]) => void;
}

export const ContextMenuSidebarContent: React.FC<
  IContextMenuSidebarContentProps
> = props => {
  const categories = useMemo<IPrompt['category'][]>(
    () => ['context_menu', 'notebook_snippet'],
    []
  );

  const { prompts } = usePrompts(categories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  return (
    <SidebarLayout
      view={props.view}
      onViewChange={val =>
        props.onViewChange(val as 'context_menu' | 'notebook_snippet')
      }
      options={[
        { value: 'context_menu', label: 'Context Menu LLM Prompts' },
        { value: 'notebook_snippet', label: 'SelenePy Notebook Snippets' }
      ]}
    >
      {props.view === 'context_menu' && (
        <PromptManagerView
          title="Right-Click Menu Options"
          category="context_menu"
          selectedPromptId={props.selectedContextMenuId}
          onSelectPrompt={props.onSelectContextMenu}
        />
      )}

      {props.view === 'notebook_snippet' && (
        <PromptManagerView
          title="Notebook Insert Snippets"
          category="notebook_snippet"
          selectedPromptId={props.selectedNotebookSnippetId}
          onSelectPrompt={props.onSelectNotebookSnippet}
          showDescription={false}
          createNewLabel="➕ Create New Snippet..."
          selectLabel="Select Snippet:"
        />
      )}
    </SidebarLayout>
  );
};
