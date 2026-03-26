import React, { useMemo, useEffect } from 'react';
import { ChatPanel } from './ChatPanel';
import type { IPrompt } from '../../types';
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
  type ChatPromptManagerView
} from '../constants';
import { IChatController } from '../chatController';
import { useChatStore } from '../useChatStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';

interface IChatSidebarContentProps {
  controller: IChatController;
}

/**
 * Functional component for the Chat sidebar that uses Zustand for state management.
 */
export const ChatSidebarContent: React.FC<IChatSidebarContentProps> = ({
  controller
}) => {
  const state = useChatStore();
  const { settings } = useSettingsStore();

  const promptCategories = useMemo(() => CHAT_PROMPT_CATEGORIES, []);
  const { prompts } = usePrompts(promptCategories);

  useEffect(() => {
    controller.handlePromptsChanged(prompts);
  }, [prompts, controller]);

  const snippets = prompts.filter(
    (p: IPrompt) => p.category === PROMPT_CATEGORY_CHAT_SNIPPET
  );

  return (
    <SidebarLayout
      view={state.view}
      onViewChange={val =>
        controller.handleViewChange(
          val as typeof CHAT_VIEW_CHAT | ChatPromptManagerView
        )
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
      {state.view === CHAT_VIEW_CHAT && (
        <>
          <ThreadSelector
            threads={state.threads}
            activeThreadId={state.activeThreadId}
            threadsLoaded={state.threadsLoaded}
            isStreaming={state.isStreaming}
            onSelectThread={id => void controller.handleSelectThread(id)}
            onCreateThread={() => void controller.handleCreateThread()}
            onDeleteThread={() => void controller.handleDeleteActiveThread()}
            onRenameThread={() => void controller.handleRenameActiveThread()}
          />
          <ChatPanel
            messages={state.messages}
            isStreaming={state.isStreaming}
            onSendMessage={msg => void controller.handleSendMessage(msg)}
            onClear={() => controller.handleClear()}
            onStop={() => controller.handleStop()}
            hasApiKey={!!settings?.openaiApiKey}
            openaiApiKey={settings?.openaiApiKey}
            snippets={snippets}
            onOpenSnippetEditor={() => {
              controller.handleSelectSnippet('__CREATE_NEW__');
              controller.handleViewChange(PROMPT_CATEGORY_CHAT_SNIPPET);
            }}
            cellContext={state.cellContext}
            lastResponseDuration={
              state.threads.find(t => t.id === state.activeThreadId)
                ?.lastResponseDuration
            }
            onUpdateResponseDuration={d =>
              void controller.handleUpdateResponseDuration(d)
            }
            activeThreadId={state.activeThreadId}
            settings={settings}
          />
        </>
      )}

      {state.view === PROMPT_CATEGORY_CHAT_SYSTEM && (
        <PromptManagerView
          title={CHAT_SYSTEM_PROMPTS_TITLE}
          category={PROMPT_CATEGORY_CHAT_SYSTEM}
          selectedPromptId={state.selectedSystemPromptId}
          onSelectPrompt={id => controller.handleSelectSystemPrompt(id)}
          createNewLabel={CREATE_NEW_SYSTEM_PROMPT_LABEL}
          selectLabel="Select System Prompt:"
        />
      )}

      {state.view === PROMPT_CATEGORY_CHAT_SNIPPET && (
        <PromptManagerView
          title={CHAT_SNIPPETS_TITLE}
          category={PROMPT_CATEGORY_CHAT_SNIPPET}
          selectedPromptId={state.selectedSnippetId}
          onSelectPrompt={id => controller.handleSelectSnippet(id)}
          showDescription={false}
          createNewLabel="➕ Create New Snippet..."
          selectLabel={SELECT_SNIPPET_LABEL}
        />
      )}
    </SidebarLayout>
  );
};
