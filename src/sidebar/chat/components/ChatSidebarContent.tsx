import React, { useMemo, useEffect } from 'react';
import { ChatPanel } from './ChatPanel';
import type { IChatMessage, IChatThread } from '../types';
import type { ISuggestedEditsSettings, IPrompt } from '../../types';
import { usePrompts } from '../../hooks/usePrompts';
import { ThreadSelector } from './ThreadSelector';
import { SidebarLayout } from '../../components/SidebarLayout';
import { PromptManagerView } from '../../components/PromptManagerView';
import {
  CHAT_SNIPPETS_TITLE,
  CHAT_PROMPT_CATEGORIES,
  CHAT_SYSTEM_PROMPTS_TITLE,
  CHAT_VIEW_CHAT,
  CHAT_VIEW_SNIPPETS_LABEL,
  CHAT_VIEW_SYSTEM_PROMPT_LABEL,
  CREATE_NEW_SYSTEM_PROMPT_LABEL,
  PROMPT_CATEGORY_CHAT_SNIPPET,
  PROMPT_CATEGORY_CHAT_SYSTEM,
  SELECT_SNIPPET_LABEL,
  type ChatPromptManagerView,
  type ChatSidebarView
} from '../constants';

interface IChatSidebarContentProps {
  view: ChatSidebarView;
  messages: IChatMessage[];
  isStreaming: boolean;
  settings: ISuggestedEditsSettings | null;
  selectedSnippetId: string;
  threads: IChatThread[];
  activeThreadId: string | null;
  threadsLoaded: boolean;
  onViewChange: (v: ChatPromptManagerView | typeof CHAT_VIEW_CHAT) => void;
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
  const promptCategories = useMemo(() => CHAT_PROMPT_CATEGORIES, []);

  const { prompts } = usePrompts(promptCategories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  const snippets = prompts.filter(
    (p: IPrompt) => p.category === PROMPT_CATEGORY_CHAT_SNIPPET
  );

  return (
    <SidebarLayout
      view={props.view}
      onViewChange={val =>
        props.onViewChange(val as typeof CHAT_VIEW_CHAT | ChatPromptManagerView)
      }
      options={[
        { value: CHAT_VIEW_CHAT, label: 'Chat' },
        {
          value: PROMPT_CATEGORY_CHAT_SYSTEM,
          label: CHAT_VIEW_SYSTEM_PROMPT_LABEL
        },
        {
          value: PROMPT_CATEGORY_CHAT_SNIPPET,
          label: CHAT_VIEW_SNIPPETS_LABEL
        }
      ]}
    >
      {props.view === CHAT_VIEW_CHAT && (
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
              props.onViewChange(PROMPT_CATEGORY_CHAT_SNIPPET);
            }}
            cellContext={props.cellContext}
            lastResponseDuration={props.lastResponseDuration}
            onUpdateResponseDuration={props.onUpdateResponseDuration}
            activeThreadId={props.activeThreadId}
            settings={props.settings}
          />
        </>
      )}

      {props.view === PROMPT_CATEGORY_CHAT_SYSTEM && (
        <PromptManagerView
          title={CHAT_SYSTEM_PROMPTS_TITLE}
          category={PROMPT_CATEGORY_CHAT_SYSTEM}
          selectedPromptId={props.selectedSystemPromptId}
          onSelectPrompt={props.onSelectSystemPrompt}
          createNewLabel={CREATE_NEW_SYSTEM_PROMPT_LABEL}
          selectLabel="Select System Prompt:"
        />
      )}

      {props.view === PROMPT_CATEGORY_CHAT_SNIPPET && (
        <PromptManagerView
          title={CHAT_SNIPPETS_TITLE}
          category={PROMPT_CATEGORY_CHAT_SNIPPET}
          selectedPromptId={props.selectedSnippetId}
          onSelectPrompt={props.onSelectSnippet}
          showDescription={false}
          createNewLabel="➕ Create New Snippet..."
          selectLabel={SELECT_SNIPPET_LABEL}
        />
      )}
    </SidebarLayout>
  );
};
