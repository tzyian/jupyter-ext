import React from 'react';
import { IPrompt } from '../../types';
import { PromptEditorCard } from '../../components/PromptEditorCard';

interface IPromptSettingsPanelProps {
  prompts: IPrompt[];
  selectedLocalPromptId: string;
  selectedGlobalPromptId: string;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
  onUpdatePrompt: (
    name: string,
    content: string,
    description: string,
    id: string
  ) => void;
  onCreatePrompt: (
    name: string,
    content: string,
    description: string
  ) => Promise<string | void>;
  onDeletePrompt: (id: string) => void;
  onBack: () => void;
}

export const PromptSettingsPanel: React.FC<IPromptSettingsPanelProps> = ({
  prompts,
  selectedLocalPromptId,
  selectedGlobalPromptId,
  onSelectLocal,
  onSelectGlobal,
  onUpdatePrompt,
  onCreatePrompt,
  onDeletePrompt,
  onBack
}) => {
  return (
    <div className="jp-selenepy-promptSettings">
      <div className="jp-selenepy-promptSettings-cards">
        <PromptEditorCard
          title="Local Suggestions"
          prompts={prompts}
          selectedPromptId={selectedLocalPromptId}
          onSelectPrompt={onSelectLocal}
          onUpdatePrompt={onUpdatePrompt}
          onCreatePrompt={onCreatePrompt}
          onDeletePrompt={onDeletePrompt}
          showDescription={false}
        />

        <PromptEditorCard
          title="Global Suggestions"
          prompts={prompts}
          selectedPromptId={selectedGlobalPromptId}
          onSelectPrompt={onSelectGlobal}
          onUpdatePrompt={onUpdatePrompt}
          onCreatePrompt={onCreatePrompt}
          onDeletePrompt={onDeletePrompt}
          showDescription={false}
        />
      </div>
    </div>
  );
};
