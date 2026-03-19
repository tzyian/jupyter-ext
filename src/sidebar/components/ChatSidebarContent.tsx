import React, { useMemo, useEffect } from 'react';
import { ChatPanel } from './ChatPanel';
import type {
  IChatMessage,
  IChatThread,
  ISuggestedEditsSettings,
  IPrompt
} from '../../types';
import { usePrompts } from '../utils/usePrompts';
import { PromptEditorCard } from './common/PromptEditorCard';
import { Select } from './common/Select';
import { ThreadSelector } from './ThreadSelector';

interface IChatSidebarContentProps {
  view: 'chat' | 'chat_snippet' | 'context_menu' | 'settings' | 'chat_system_prompt';
  messages: IChatMessage[];
  isStreaming: boolean;
  settings: ISuggestedEditsSettings | null;
  selectedSnippetId: string;
  selectedContextMenuId: string;
  threads: IChatThread[];
  activeThreadId: string | null;
  threadsLoaded: boolean;
  onViewChange: (v: 'chat' | 'chat_snippet' | 'context_menu' | 'chat_system_prompt') => void;
  onSendMessage: (msg: string) => void;
  onClear: () => void;
  onStop: () => void;
  onSelectSnippet: (id: string) => void;
  onSelectContextMenu: (id: string) => void;
  onPromptsChanged: (prompts: IPrompt[]) => void;
  onSelectThread: (id: string) => void;
  onCreateThread: () => void;
  onDeleteThread: () => void;
  onRenameThread: () => void;
  cellContext: { cellNumber: number; excerpt?: string } | null;
  onSettingsChanged: (settings: Partial<ISuggestedEditsSettings>) => void;
  lastResponseDuration?: number;
  onUpdateResponseDuration: (duration: number) => void;
}

/**
 * Functional component for the Chat sidebar that uses hooks for state management.
 */
export const ChatSidebarContent: React.FC<IChatSidebarContentProps> = props => {
  const promptCategories = useMemo<IPrompt['category'][]>(
    () => ['chat_snippet', 'context_menu', 'chat', 'chat_system_prompt'],
    []
  );

  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts(promptCategories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  const snippets = prompts.filter(
    (p: IPrompt) => p.category === 'chat_snippet'
  );
  const contextMenus = prompts.filter(
    (p: IPrompt) => p.category === 'context_menu' || p.category === 'chat'
  );
  const systemPrompts = prompts.filter(
    (p: IPrompt) => p.category === 'chat_system_prompt'
  );

  useEffect(() => {
    if (
      props.selectedSnippetId !== '__CREATE_NEW__' &&
      !snippets.some(p => p.id === props.selectedSnippetId)
    ) {
      props.onSelectSnippet('__CREATE_NEW__');
    }
  }, [snippets, props.selectedSnippetId]);

  useEffect(() => {
    if (
      props.selectedContextMenuId !== '__CREATE_NEW__' &&
      !contextMenus.some(p => p.id === props.selectedContextMenuId)
    ) {
      props.onSelectContextMenu('__CREATE_NEW__');
    }
  }, [contextMenus, props.selectedContextMenuId]);

  return (
    <div className="jp-selenepy-sidebar-wrapper">
      <div className="jp-selenepy-sidebar-header-row">
        <Select
          label="View:"
          value={props.view}
          onChange={val =>
            props.onViewChange(val as 'chat' | 'chat_snippet' | 'context_menu' | 'chat_system_prompt')
          }
          options={[
            { value: 'chat', label: 'Chat' },
            { value: 'chat_system_prompt', label: 'Manage System Prompts' },
            { value: 'chat_snippet', label: 'Manage Chat Snippets' },
            { value: 'context_menu', label: 'Manage Context Menus' }
          ]}
          className="jp-selenepy-select-inline"
        />
      </div>

      <div className="jp-selenepy-sidebar-content">
        {props.view === 'chat' && (
          <>
            <ThreadSelector
              threads={props.threads}
              activeThreadId={props.activeThreadId}
              threadsLoaded={props.threadsLoaded}
              isStreaming={props.isStreaming}
              onSelectThread={props.onSelectThread}
              onCreateThread={props.onCreateThread}
              onDeleteThread={props.onDeleteThread}
              onRenameThread={props.onRenameThread}
            />
            <ChatPanel
              messages={props.messages}
              isStreaming={props.isStreaming}
              onSendMessage={props.onSendMessage}
              onClear={props.onClear}
              onStop={props.onStop}
              hasApiKey={!!props.settings?.openaiApiKey}
              openaiApiKey={props.settings?.openaiApiKey}
              snippets={snippets}
              cellContext={props.cellContext}
              lastResponseDuration={props.lastResponseDuration}
              onUpdateResponseDuration={props.onUpdateResponseDuration}
              activeThreadId={props.activeThreadId}
              settings={props.settings}
              onSettingsChanged={props.onSettingsChanged}
            />
          </>
        )}

        {props.view === 'context_menu' && (
          <div className="jp-selenepy-promptSettings-cards">
            <PromptEditorCard
              title="Right-Click Menu Options"
              prompts={contextMenus}
              selectedPromptId={props.selectedContextMenuId}
              onSelectPrompt={props.onSelectContextMenu}
              onUpdatePrompt={(n, c, d, i) =>
                updatePrompt(n, c, d, i, 'context_menu')
              }
              onCreatePrompt={(n, c, d) =>
                createPrompt(n, c, d, 'context_menu')
              }
              onDeletePrompt={removePrompt}
            />
          </div>
        )}

        {props.view === 'chat_system_prompt' && (
          <div className="jp-selenepy-promptSettings-cards">
            <PromptEditorCard
              title="Chat System Prompts"
              prompts={systemPrompts}
              selectedPromptId={props.settings?.chatSystemPrompt || 'default_chat_system'}
              onSelectPrompt={id => {
                if (props.onSettingsChanged) {
                  props.onSettingsChanged({ chatSystemPrompt: id });
                }
              }}
              onUpdatePrompt={(n, c, d, i) =>
                updatePrompt(n, c, d, i, 'chat_system_prompt')
              }
              onCreatePrompt={(n, c, d) =>
                createPrompt(n, c, d, 'chat_system_prompt')
              }
              onDeletePrompt={removePrompt}
              createNewLabel="➕ Create New System Prompt..."
              selectLabel="Select System Prompt:"
            />
          </div>
        )}

        {props.view === 'chat_snippet' && (
          <div className="jp-selenepy-promptSettings-cards">
            <PromptEditorCard
              title="Reusable Chat Snippets"
              prompts={snippets}
              selectedPromptId={props.selectedSnippetId}
              onSelectPrompt={props.onSelectSnippet}
              onUpdatePrompt={(n, c, d, i) =>
                updatePrompt(n, c, d, i, 'chat_snippet')
              }
              onCreatePrompt={(n, c, d) =>
                createPrompt(n, c, d, 'chat_snippet')
              }
              onDeletePrompt={removePrompt}
              showDescription={false}
              createNewLabel="➕ Create New Snippet..."
              selectLabel="Select Snippet:"
            />
          </div>
        )}
      </div>
    </div>
  );
};
