import React, { useState, useEffect, useCallback } from 'react';
import { IPrompt } from '../../../types';

interface IPromptCardProps {
  title: string;
  prompts: IPrompt[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
  onUpdatePrompt: (name: string, content: string, id: string) => void;
  onCreatePrompt: (name: string, content: string) => Promise<string | void>;
  onDeletePrompt: (id: string) => void;
}

export const PromptCard: React.FC<IPromptCardProps> = ({
  title,
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onUpdatePrompt,
  onCreatePrompt,
  onDeletePrompt
}) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState<number | null>(null);

  // Load prompt into editor when selection changes
  useEffect(() => {
    if (isCreatingNew) {
      setName('');
      setContent('');
      return;
    }

    const found = prompts.find(p => p.id === selectedPromptId);
    if (found) {
      setName(found.name);
      setContent(found.content);
    }
  }, [selectedPromptId, prompts, isCreatingNew]);

  // Auto-save with debouncing
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer);
    }

    const timer = window.setTimeout(() => {
      handleSave();
    }, 500);

    setAutoSaveTimer(timer);
  }, [name, content, isCreatingNew, selectedPromptId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer) {
        window.clearTimeout(autoSaveTimer);
      }
    };
  }, [autoSaveTimer]);

  const handleSave = async () => {
    if (!name || !content) {
      return;
    }

    if (isCreatingNew) {
      const newId = await onCreatePrompt(name, content);
      if (newId) {
        setIsCreatingNew(false);
        onSelectPrompt(newId);
      } else {
        // Fallback if no ID returned
        setName('');
        setContent('');
        setIsCreatingNew(false);
      }
    } else {
      const found = prompts.find(p => p.id === selectedPromptId);
      if (found && !found.isDefault) {
        onUpdatePrompt(name, content, selectedPromptId);
      }
    }

    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleDelete = () => {
    if (!isCreatingNew && selectedPromptId !== 'default') {
      const found = prompts.find(p => p.id === selectedPromptId);
      if (found && !found.isDefault) {
        onDeletePrompt(selectedPromptId);
        // Reset to default after delete
        onSelectPrompt('default');
      }
    }
  };

  const handleDropdownChange = (value: string) => {
    if (value === '__CREATE_NEW__') {
      setIsCreatingNew(true);
      setName('');
      setContent('');
    } else {
      setIsCreatingNew(false);
      onSelectPrompt(value);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    triggerAutoSave();
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    triggerAutoSave();
  };

  const activePrompt = isCreatingNew
    ? null
    : prompts.find(p => p.id === selectedPromptId);
  const canEdit = isCreatingNew || (activePrompt && !activePrompt.isDefault);

  return (
    <div className="jp-selenepy-promptCard">
      <div className="jp-selenepy-promptCard-header">
        <h3>{title}</h3>
      </div>

      <div className="jp-selenepy-promptCard-dropdown">
        <label>Select Prompt:</label>
        <select
          value={isCreatingNew ? '__CREATE_NEW__' : selectedPromptId}
          onChange={e => handleDropdownChange(e.target.value)}
          className="jp-selenepy-promptSelector"
        >
          {prompts.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__CREATE_NEW__">➕ Create New Prompt...</option>
        </select>
      </div>

      <div className="jp-selenepy-promptCard-editor">
        <input
          type="text"
          placeholder="Prompt Name"
          value={name}
          onChange={handleNameChange}
          disabled={!canEdit}
          className="jp-selenepy-promptInput"
        />
        <textarea
          placeholder="System Prompt Content..."
          value={content}
          onChange={handleContentChange}
          disabled={!canEdit}
          className="jp-selenepy-promptTextarea"
        />

        <div className="jp-selenepy-promptCard-actions">
          {!canEdit && (
            <span className="jp-selenepy-infoText">
              Default prompt cannot be edited.
            </span>
          )}

          {saveStatus && (
            <span className="jp-selenepy-promptCard-status">{saveStatus}</span>
          )}

          {canEdit && !isCreatingNew && (
            <button className="jp-selenepy-deleteBtn" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
