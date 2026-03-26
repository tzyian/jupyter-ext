import React, { useState, useEffect, useCallback } from 'react';
import { IPrompt } from '../types';
import { Select } from './Select';
import { Button } from './Button';
import { Card } from './Card';

export interface IPromptEditorCardProps {
  title: string;
  prompts: IPrompt[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
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
  showDescription?: boolean; // Some prompts like local/global might not need descriptions shown
  createNewLabel?: string;
  selectLabel?: string;
}

export const PromptEditorCard: React.FC<IPromptEditorCardProps> = ({
  title,
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onUpdatePrompt,
  onCreatePrompt,
  onDeletePrompt,
  showDescription = true,
  createNewLabel = '➕ Create New...',
  selectLabel = 'Select Option:'
}) => {
  const isCreatingNew = selectedPromptId === '__CREATE_NEW__';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState<number | null>(null);

  useEffect(() => {
    if (isCreatingNew) {
      setName('');
      setDescription('');
      setContent('');
      return;
    }

    const found = prompts.find(p => p.id === selectedPromptId);
    if (found) {
      setName(found.name);
      setDescription(found.description || '');
      setContent(found.content);
    }
  }, [selectedPromptId, prompts, isCreatingNew]);

  const handleSave = useCallback(
    async (
      currentName: string,
      currentContent: string,
      currentDescription: string
    ) => {
      if (!currentName || !currentContent) {
        return;
      }

      if (isCreatingNew) {
        const newId = await onCreatePrompt(
          currentName,
          currentContent,
          currentDescription
        );
        if (newId) {
          onSelectPrompt(newId);
        }
      } else {
        const found = prompts.find(p => p.id === selectedPromptId);
        if (found && !found.isDefault) {
          onUpdatePrompt(
            currentName,
            currentContent,
            currentDescription,
            selectedPromptId
          );
        }
      }

      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(''), 2000);
    },
    [
      isCreatingNew,
      selectedPromptId,
      onCreatePrompt,
      onUpdatePrompt,
      prompts,
      onSelectPrompt
    ]
  );

  const triggerAutoSave = useCallback(
    (
      currentName: string,
      currentContent: string,
      currentDescription: string
    ) => {
      if (autoSaveTimer) {
        window.clearTimeout(autoSaveTimer);
      }
      const timer = window.setTimeout(() => {
        handleSave(currentName, currentContent, currentDescription);
      }, 500);
      setAutoSaveTimer(timer);
    },
    [autoSaveTimer, handleSave]
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimer) {
        window.clearTimeout(autoSaveTimer);
      }
    };
  }, [autoSaveTimer]);

  const handleDelete = () => {
    if (!isCreatingNew) {
      const found = prompts.find(p => p.id === selectedPromptId);
      if (found && !found.isDefault) {
        onDeletePrompt(selectedPromptId);
        onSelectPrompt('__CREATE_NEW__');
      }
    }
  };

  const activePrompt = isCreatingNew
    ? null
    : prompts.find(p => p.id === selectedPromptId);
  const canEdit = isCreatingNew || (activePrompt && !activePrompt.isDefault);

  const selectOptions = [
    ...prompts.map(p => ({ value: p.id, label: p.name })),
    { value: '__CREATE_NEW__', label: createNewLabel }
  ];

  return (
    <Card title={title}>
      <div className="jp-selenepy-promptCard-dropdown">
        <Select
          label={selectLabel}
          value={selectedPromptId}
          onChange={onSelectPrompt}
          options={selectOptions}
          className="jp-selenepy-promptSelector"
        />
      </div>

      <div className="jp-selenepy-promptCard-editor">
        <label>Display Text</label>
        <input
          type="text"
          placeholder="e.g. Optimize Code"
          value={name}
          onChange={e => {
            const newName = e.target.value;
            setName(newName);
            triggerAutoSave(newName, content, description);
          }}
          disabled={!canEdit}
          className="jp-selenepy-promptInput"
        />

        {showDescription && (
          <React.Fragment>
            <label>Description (Tooltip)</label>
            <input
              type="text"
              placeholder="e.g. Optimizes the selected code"
              value={description}
              onChange={e => {
                const newDescription = e.target.value;
                setDescription(newDescription);
                triggerAutoSave(name, content, newDescription);
              }}
              disabled={!canEdit}
              className="jp-selenepy-promptInput"
            />
          </React.Fragment>
        )}

        <label>Instruction Sent to LLM</label>
        <textarea
          placeholder="System Prompt Content..."
          value={content}
          onChange={e => {
            const newContent = e.target.value;
            setContent(newContent);
            triggerAutoSave(name, newContent, description);
          }}
          disabled={!canEdit}
          className={`jp-selenepy-promptTextarea ${
            showDescription
              ? 'jp-selenepy-promptTextarea-short'
              : 'jp-selenepy-promptTextarea-long'
          }`}
        />

        <div className="jp-selenepy-promptCard-actions">
          {!canEdit && (
            <span className="jp-selenepy-infoText">
              Default Option cannot be edited.
            </span>
          )}

          {saveStatus && (
            <span className="jp-selenepy-promptCard-status">{saveStatus}</span>
          )}

          {canEdit && !isCreatingNew && (
            <Button
              variant="danger"
              onClick={handleDelete}
              className="jp-selenepy-deleteBtn"
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
