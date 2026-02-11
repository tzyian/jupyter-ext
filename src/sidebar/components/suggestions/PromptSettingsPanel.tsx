import React from 'react';
import { IPrompt } from '../../../types';
import { PromptCard } from './PromptCard';

interface IPromptSettingsPanelProps {
  prompts: IPrompt[];
  selectedLocalPromptId: string;
  selectedGlobalPromptId: string;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
  onUpdatePrompt: (name: string, content: string, id: string) => void;
  onCreatePrompt: (name: string, content: string) => Promise<string | void>;
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
      <header className="jp-selenepy-promptSettings-header">
        <button className="jp-selenepy-promptSettings-backBtn" onClick={onBack}>
          ← Back
        </button>
        <h2>Manage Prompts</h2>
      </header>

      <div className="jp-selenepy-promptSettings-cards">
        <PromptCard
          title="Local Suggestions"
          prompts={prompts}
          selectedPromptId={selectedLocalPromptId}
          onSelectPrompt={onSelectLocal}
          onUpdatePrompt={onUpdatePrompt}
          onCreatePrompt={onCreatePrompt}
          onDeletePrompt={onDeletePrompt}
        />

        <PromptCard
          title="Global Suggestions"
          prompts={prompts}
          selectedPromptId={selectedGlobalPromptId}
          onSelectPrompt={onSelectGlobal}
          onUpdatePrompt={onUpdatePrompt}
          onCreatePrompt={onCreatePrompt}
          onDeletePrompt={onDeletePrompt}
        />
      </div>
    </div>
  );
};
