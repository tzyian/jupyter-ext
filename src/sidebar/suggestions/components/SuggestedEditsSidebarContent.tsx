import React from 'react';
import { IResolvedSuggestion } from '../types';
import { SuggestedEditsPanel } from './SuggestedEditsPanel';
import { PromptSettingsPanel } from './PromptSettingsPanel';
import { usePrompts } from '../../hooks/usePrompts';
import { SidebarLayout } from '../../components/SidebarLayout';
import { useSuggestedEditsStore } from '../useSuggestedEditsStore';

/**
 * Props for the SuggestedEditsSidebarContent component.
 */
export interface ISuggestedEditsSidebarContentProps {
  onRefreshContext: () => void;
  onRefreshFull: () => void;
  onPauseToggle: () => void;
  onApply: (s: IResolvedSuggestion) => void;
  onDismiss: (s: IResolvedSuggestion) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
}

export const SuggestedEditsSidebarContent: React.FC<{
  onRefreshContext: () => void;
  onRefreshFull: () => void;
  onPauseToggle: () => void;
  onApply: (s: IResolvedSuggestion) => void;
  onDismiss: (s: IResolvedSuggestion) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
}> = props => {
  const {
    view,
    status,
    isPaused,
    hasApiKey,
    localSuggestions,
    globalSuggestion,
    selectedLocalPromptId,
    selectedGlobalPromptId
  } = useSuggestedEditsStore();

  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts('suggestion');

  return (
    <SidebarLayout
      view={view === 'home' ? 'suggestions' : 'settings'}
      onViewChange={val => {
        if (val === 'suggestions') {
          props.onBack();
        } else {
          props.onOpenSettings();
        }
      }}
      options={[
        { value: 'suggestions', label: 'Suggestions' },
        { value: 'settings', label: 'Manage Prompts' }
      ]}
    >
      {view === 'settings' ? (
        <PromptSettingsPanel
          prompts={prompts}
          selectedLocalPromptId={selectedLocalPromptId}
          selectedGlobalPromptId={selectedGlobalPromptId}
          onSelectLocal={props.onSelectLocal}
          onSelectGlobal={props.onSelectGlobal}
          onUpdatePrompt={updatePrompt}
          onCreatePrompt={createPrompt}
          onDeletePrompt={removePrompt}
          onBack={props.onBack}
        />
      ) : (
        <SuggestedEditsPanel
          status={status}
          isPaused={isPaused}
          localSuggestions={localSuggestions}
          globalSuggestion={globalSuggestion}
          onRefreshContext={props.onRefreshContext}
          onRefreshFull={props.onRefreshFull}
          onPauseToggle={props.onPauseToggle}
          onApply={props.onApply}
          onDismiss={props.onDismiss}
          onOpenSettings={props.onOpenSettings}
          hasApiKey={hasApiKey}
        />
      )}
    </SidebarLayout>
  );
};
