import React, { useState, useEffect } from 'react';
import { IPrompt } from '../../../types';

interface IPromptSettingsPanelProps {
  prompts: IPrompt[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
  onUpdatePrompt: (name: string, content: string, id: string) => void;
  onCreatePrompt: (name: string, content: string) => void;
  onDeletePrompt: (id: string) => void;
  onBack: () => void;
}

export const PromptSettingsPanel: React.FC<IPromptSettingsPanelProps> = ({
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onUpdatePrompt,
  onCreatePrompt,
  onDeletePrompt,
  onBack
}) => {
  const [activePrompt, setActivePrompt] = useState<IPrompt | undefined>(
    undefined
  );
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isNew, setIsNew] = useState(false);

  // Update form when selected prompt changes
  useEffect(() => {
    // If we're creating a new one, don't overwrite if user is typing?
    // Actually, simple logic: if selectedPromptId matches a real prompt, load it.
    // If user explicitly chose "New...", we handle that.

    // For this UI, let's say "New" is a mode.
    const found = prompts.find(p => p.id === selectedPromptId);
    if (found) {
      setActivePrompt(found);
      setName(found.name);
      setContent(found.content);
      setIsNew(false);
    } else {
      // Fallback or "current selection not found"
    }
  }, [selectedPromptId, prompts]);

  const handleCreateNew = () => {
    setIsNew(true);
    setActivePrompt(undefined);
    setName('');
    setContent('');
  };

  const [saveStatus, setSaveStatus] = useState('');

  const handleSave = () => {
    if (!name || !content) {
      return;
    }

    if (isNew) {
      onCreatePrompt(name, content);
    } else if (activePrompt && !activePrompt.isDefault) {
      onUpdatePrompt(name, content, activePrompt.id);
    }
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleDelete = () => {
    if (activePrompt && !activePrompt.isDefault) {
      onDeletePrompt(activePrompt.id);
    }
  };

  const canEdit = isNew || (activePrompt && !activePrompt.isDefault);

  return (
    <div className="jp-selenepy-promptSettings">
      <header className="jp-selenepy-promptSettings-header">
        <button className="jp-selenepy-promptSettings-backBtn" onClick={onBack}>
          ← Back
        </button>
        <h2>Manage Prompts</h2>
      </header>

      <div className="jp-selenepy-promptSettings-controls">
        <label>Active Prompt:</label>
        <div className="jp-selenepy-promptSettings-selectRow">
          <select
            value={isNew ? 'NEW_ENTRY' : selectedPromptId}
            onChange={e => {
              const val = e.target.value;
              if (val === 'NEW_ENTRY') {
                handleCreateNew();
              } else {
                onSelectPrompt(val);
                setIsNew(false);
              }
            }}
            className="jp-selenepy-promptSelector"
          >
            {prompts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="NEW_ENTRY">➕ Create New Prompt...</option>
          </select>
        </div>
      </div>

      <div className="jp-selenepy-promptSettings-editor">
        <input
          type="text"
          placeholder="Prompt Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!canEdit}
          className="jp-selenepy-promptInput"
        />
        <textarea
          placeholder="System Prompt Content..."
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={!canEdit}
          className="jp-selenepy-promptTextarea"
        />

        <div className="jp-selenepy-promptSettings-actions">
          {!isNew && activePrompt && activePrompt.isDefault && (
            <span className="jp-selenepy-infoText">
              Default prompt cannot be edited.
            </span>
          )}

          {saveStatus && (
            <span
              className="jp-selenepy-statusText"
              style={{ color: 'var(--jp-success-color1)', marginRight: '8px' }}
            >
              {saveStatus}
            </span>
          )}

          {canEdit && (
            <button
              className="jp-selenepy-saveBtn"
              onClick={handleSave}
              disabled={!name || !content}
            >
              {isNew ? 'Create Prompt' : 'Save Changes'}
            </button>
          )}

          {!isNew && canEdit && (
            <button className="jp-selenepy-deleteBtn" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
