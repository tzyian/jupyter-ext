import React from 'react';
import { IResolvedSuggestion, ISuggestedEditsState } from '../types';
import { SuggestedEditsPanel } from './SuggestedEditsPanel';
import { PromptSettingsPanel } from './PromptSettingsPanel';
import { usePrompts } from '../../hooks/usePrompts';
import { SidebarLayout } from '../../components/SidebarLayout';

/**
 * Props for the SuggestedEditsSidebarContent component.
 * Extends ISuggestedEditsState with action callbacks.
 */
export interface ISuggestedEditsSidebarContentProps extends ISuggestedEditsState {
  onRefreshContext: () => void;
  onRefreshFull: () => void;
  onPauseToggle: () => void;
  onApply: (s: IResolvedSuggestion) => void;
  onDismiss: (s: IResolvedSuggestion, idx?: number) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
}

export const SuggestedEditsSidebarContent: React.FC<
  ISuggestedEditsSidebarContentProps
> = props => {
  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts('suggestion');

  return (
    <SidebarLayout
      view={props.view === 'home' ? 'suggestions' : 'settings'}
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
      {props.view === 'settings' ? (
        <PromptSettingsPanel
          prompts={prompts}
          selectedLocalPromptId={props.selectedLocalPromptId}
          selectedGlobalPromptId={props.selectedGlobalPromptId}
          onSelectLocal={props.onSelectLocal}
          onSelectGlobal={props.onSelectGlobal}
          onUpdatePrompt={updatePrompt}
          onCreatePrompt={createPrompt}
          onDeletePrompt={removePrompt}
          onBack={props.onBack}
        />
      ) : (
        <SuggestedEditsPanel
          status={props.status}
          isPaused={props.isPaused}
          localSuggestions={props.localSuggestions}
          globalSuggestion={props.globalSuggestion}
          onRefreshContext={props.onRefreshContext}
          onRefreshFull={props.onRefreshFull}
          onPauseToggle={props.onPauseToggle}
          onApply={props.onApply}
          onDismiss={props.onDismiss}
          onOpenSettings={props.onOpenSettings}
          hasApiKey={props.hasApiKey}
        />
      )}
    </SidebarLayout>
  );
};
