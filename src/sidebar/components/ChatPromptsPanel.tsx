import React, { useState, useEffect, useCallback } from 'react';
import { IPrompt } from '../../types';

interface IChatPromptsPanelProps {
  prompts: IPrompt[];
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

export const ChatPromptsPanel: React.FC<IChatPromptsPanelProps> = ({
  prompts,
  onUpdatePrompt,
  onCreatePrompt,
  onDeletePrompt,
  onBack
}) => {
  const [selectedPromptId, setSelectedPromptId] = useState<string>('__CREATE_NEW__');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(true);

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

  const handleSave = async () => {
    if (!name || !content) {
      return;
    }

    if (isCreatingNew) {
      const newId = await onCreatePrompt(name, content, description);
      if (newId) {
        setIsCreatingNew(false);
        setSelectedPromptId(newId);
      } else {
        setIsCreatingNew(false);
      }
    } else {
      const found = prompts.find(p => p.id === selectedPromptId);
      if (found && !found.isDefault) {
        onUpdatePrompt(name, content, description, selectedPromptId);
      }
    }

    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer);
    }
    const timer = window.setTimeout(handleSave, 500);
    setAutoSaveTimer(timer);
  }, [
    name,
    description,
    content,
    isCreatingNew,
    selectedPromptId,
    autoSaveTimer
  ]);

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
        setIsCreatingNew(true);
        setSelectedPromptId('__CREATE_NEW__');
      }
    }
  };

  const handleDropdownChange = (value: string) => {
    if (value === '__CREATE_NEW__') {
      setIsCreatingNew(true);
      setSelectedPromptId(value);
    } else {
      setIsCreatingNew(false);
      setSelectedPromptId(value);
    }
  };

  const activePrompt = isCreatingNew
    ? null
    : prompts.find(p => p.id === selectedPromptId);
  const canEdit = isCreatingNew || (activePrompt && !activePrompt.isDefault);

  return (
    <div className="jp-selenepy-promptSettings">
      <header className="jp-selenepy-promptSettings-header">
        <button className="jp-selenepy-promptSettings-backBtn" onClick={onBack}>
          ← Back
        </button>
        <h2>Chat Menu Options</h2>
      </header>

      <div className="jp-selenepy-promptSettings-cards">
        <div className="jp-selenepy-promptCard">
          <div className="jp-selenepy-promptCard-header">
            <h3>Right-Click Options</h3>
          </div>

          <div className="jp-selenepy-promptCard-dropdown">
            <label>Select Option:</label>
            <select
              value={selectedPromptId}
              onChange={e => handleDropdownChange(e.target.value)}
              className="jp-selenepy-promptSelector"
            >
              {prompts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__CREATE_NEW__">➕ Create New Option...</option>
            </select>
          </div>

          <div className="jp-selenepy-promptCard-editor">
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '4px',
                marginTop: '12px'
              }}
            >
              Display Text (Context Menu)
            </label>
            <input
              type="text"
              placeholder="e.g. Optimize Code"
              value={name}
              onChange={e => {
                setName(e.target.value);
                triggerAutoSave();
              }}
              disabled={!canEdit}
              className="jp-selenepy-promptInput"
            />

            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '4px',
                marginTop: '12px'
              }}
            >
              Description (Tooltip)
            </label>
            <input
              type="text"
              placeholder="e.g. Optimizes the selected code"
              value={description}
              onChange={e => {
                setDescription(e.target.value);
                triggerAutoSave();
              }}
              disabled={!canEdit}
              className="jp-selenepy-promptInput"
            />

            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 'bold',
                marginBottom: '4px',
                marginTop: '12px'
              }}
            >
              Instruction Sent to LLM
            </label>
            <textarea
              placeholder="System Prompt Content..."
              value={content}
              onChange={e => {
                setContent(e.target.value);
                triggerAutoSave();
              }}
              disabled={!canEdit}
              className="jp-selenepy-promptTextarea"
              style={{ minHeight: '150px' }}
            />

            <div className="jp-selenepy-promptCard-actions">
              {!canEdit && (
                <span className="jp-selenepy-infoText">
                  Default Option cannot be edited.
                </span>
              )}

              {saveStatus && (
                <span className="jp-selenepy-promptCard-status">
                  {saveStatus}
                </span>
              )}

              {canEdit && !isCreatingNew && (
                <button
                  className="jp-selenepy-deleteBtn"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
