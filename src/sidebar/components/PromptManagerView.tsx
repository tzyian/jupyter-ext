import React, { useEffect, useState } from 'react';
import { PromptEditorCard } from './PromptEditorCard';
import { usePrompts } from '../hooks/usePrompts';
import { PromptCategory } from '../types';

export interface IPromptManagerViewProps {
  title: string;
  category: PromptCategory;
  selectedPromptId?: string;
  onSelectPrompt?: (id: string) => void;
  showDescription?: boolean;
  createNewLabel?: string;
  selectLabel?: string;
}

/**
 * A reusable view that manages prompts for a specific category using PromptEditorCard and usePrompts hook.
 */
export const PromptManagerView: React.FC<IPromptManagerViewProps> = ({
  title,
  category,
  selectedPromptId,
  onSelectPrompt,
  showDescription = true,
  createNewLabel,
  selectLabel
}) => {
  const { prompts, loading, updatePrompt, createPrompt, removePrompt } =
    usePrompts(category);
  const [localSelectedId, setLocalSelectedId] = useState<string>(
    selectedPromptId || '__CREATE_NEW__'
  );

  const activeId =
    selectedPromptId !== undefined ? selectedPromptId : localSelectedId;

  const handleSelect = (id: string) => {
    setLocalSelectedId(id);
    if (onSelectPrompt) {
      onSelectPrompt(id);
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (
      activeId !== '__CREATE_NEW__' &&
      !prompts.some(p => p.id === activeId)
    ) {
      handleSelect('__CREATE_NEW__');
    }
  }, [loading, prompts, activeId]);

  return (
    <div className="jp-selenepy-promptSettings-cards">
      <PromptEditorCard
        title={title}
        prompts={prompts}
        selectedPromptId={activeId}
        onSelectPrompt={handleSelect}
        onUpdatePrompt={(n, c, d, i) => updatePrompt(n, c, d, i, category)}
        onCreatePrompt={(n, c, d) => createPrompt(n, c, d, category)}
        onDeletePrompt={removePrompt}
        showDescription={showDescription}
        createNewLabel={createNewLabel}
        selectLabel={selectLabel}
      />
    </div>
  );
};
