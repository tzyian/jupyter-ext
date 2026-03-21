import React, { useMemo, useEffect } from 'react';
import { ChatPanel } from './ChatPanel';
import type {
  IChatMessage,
  IChatThread,
  ISuggestedEditsSettings,
  IPrompt
} from '../../types';
import { usePrompts } from '../utils/usePrompts';
import { ThreadSelector } from './ThreadSelector';
import { SidebarLayout } from './common/SidebarLayout';
import { PromptManagerView } from './common/PromptManagerView';

interface IChatSidebarContentProps {
  view: 'chat' | 'chat_snippet' | 'settings' | 'chat_system_prompt';
  messages: IChatMessage[];
  isStreaming: boolean;
  settings: ISuggestedEditsSettings | null;
  selectedSnippetId: string;
  threads: IChatThread[];
  activeThreadId: string | null;
  threadsLoaded: boolean;
  onViewChange: (v: 'chat' | 'chat_snippet' | 'chat_system_prompt') => void;
  onSendMessage: (msg: string) => void;
  onClear: () => void;
  onStop: () => void;
  onSelectSnippet: (id: string) => void;
  onSelectSystemPrompt: (id: string) => void;
  onPromptsChanged: (prompts: IPrompt[]) => void;
  onSelectThread: (id: string) => void;
  onCreateThread: () => void;
  onDeleteThread: () => void;
  onRenameThread: () => void;
  cellContext: { cellNumber: number; excerpt?: string } | null;
  selectedSystemPromptId: string;
  lastResponseDuration?: number;
  onUpdateResponseDuration: (duration: number) => void;
}

/**
 * Functional component for the Chat sidebar that uses hooks for state management.
 */
export const ChatSidebarContent: React.FC<IChatSidebarContentProps> = props => {
  const promptCategories = useMemo<IPrompt['category'][]>(
    () => ['chat_snippet', 'chat', 'chat_system_prompt'],
    []
  );

  const { prompts } = usePrompts(promptCategories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  const snippets = prompts.filter(
    (p: IPrompt) => p.category === 'chat_snippet'
  );

  return (
    <SidebarLayout
      view={props.view}
      onViewChange={val =>
        props.onViewChange(
          val as 'chat' | 'chat_snippet' | 'chat_system_prompt'
        )
      }
      options={[
        { value: 'chat', label: 'Chat' },
        { value: 'chat_system_prompt', label: 'Manage System Prompts' },
        { value: 'chat_snippet', label: 'Manage Chat Snippets' }
      ]}
    >
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
            onOpenSnippetEditor={() => {
              props.onSelectSnippet('__CREATE_NEW__');
              props.onViewChange('chat_snippet');
            }}
            cellContext={props.cellContext}
            lastResponseDuration={props.lastResponseDuration}
            onUpdateResponseDuration={props.onUpdateResponseDuration}
            activeThreadId={props.activeThreadId}
            settings={props.settings}
          />
        </>
      )}

      {props.view === 'chat_system_prompt' && (
        <PromptManagerView
          title="Chat System Prompts"
          category="chat_system_prompt"
          selectedPromptId={props.selectedSystemPromptId}
          onSelectPrompt={props.onSelectSystemPrompt}
          createNewLabel="➕ Create New System Prompt..."
          selectLabel="Select System Prompt:"
        />
      )}

      {props.view === 'chat_snippet' && (
        <PromptManagerView
          title="Reusable Chat Snippets"
          category="chat_snippet"
          selectedPromptId={props.selectedSnippetId}
          onSelectPrompt={props.onSelectSnippet}
          showDescription={false}
          createNewLabel="➕ Create New Snippet..."
          selectLabel="Select Snippet:"
        />
      )}
    </SidebarLayout>
  );
};
