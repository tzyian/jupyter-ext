import React from 'react';
import { IResolvedSuggestion } from '../types';
import { SuggestedEditsPanel } from './SuggestedEditsPanel';
import { PromptSettingsPanel } from './PromptSettingsPanel';
import { usePrompts } from '../../hooks/usePrompts';
import { SidebarLayout } from '../../components/SidebarLayout';
import { useSuggestedEditsStore } from '../useSuggestedEditsStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';

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

export const SuggestedEditsSidebarContent: React.FC<
  ISuggestedEditsSidebarContentProps
> = props => {
  const state = useSuggestedEditsStore();
  const { settings } = useSettingsStore();
  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts('suggestion');

  return (
    <SidebarLayout
      view={state.view === 'home' ? 'suggestions' : 'settings'}
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
      {state.view === 'settings' ? (
        <PromptSettingsPanel
          prompts={prompts}
          selectedLocalPromptId={state.selectedLocalPromptId}
          selectedGlobalPromptId={state.selectedGlobalPromptId}
          onSelectLocal={props.onSelectLocal}
          onSelectGlobal={props.onSelectGlobal}
          onUpdatePrompt={updatePrompt}
          onCreatePrompt={createPrompt}
          onDeletePrompt={removePrompt}
          onBack={props.onBack}
        />
      ) : (
        <SuggestedEditsPanel
          status={state.status}
          isPaused={state.isPaused}
          localSuggestions={state.localSuggestions}
          globalSuggestion={state.globalSuggestion}
          onRefreshContext={props.onRefreshContext}
          onRefreshFull={props.onRefreshFull}
          onPauseToggle={props.onPauseToggle}
          onApply={props.onApply}
          onDismiss={props.onDismiss}
          onOpenSettings={props.onOpenSettings}
          hasApiKey={!!settings?.openaiApiKey}
        />
      )}
    </SidebarLayout>
  );
};
