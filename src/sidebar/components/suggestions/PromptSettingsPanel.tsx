import React, { useState, useEffect } from 'react';
import { IPrompt } from '../../../types';

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
  // State for the "Editor" section
  const [editingPromptId, setEditingPromptId] = useState<string | 'NEW'>('NEW');

  // Form state
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Load prompt into editor when selection changes
  useEffect(() => {
    if (editingPromptId === 'NEW') {
      setName('');
      setContent('');
      return;
    }
    const found = prompts.find(p => p.id === editingPromptId);
    if (found) {
      setName(found.name);
      setContent(found.content);
    }
  }, [editingPromptId, prompts]);

  const handleSave = async () => {
    if (!name || !content) {
      return;
    }

    if (editingPromptId === 'NEW') {
      const newId = await onCreatePrompt(name, content);
      if (newId) {
        setEditingPromptId(newId);
      } else {
        // Fallback if no ID returned
        setName('');
        setContent('');
      }
    } else {
      const found = prompts.find(p => p.id === editingPromptId);
      if (found && !found.isDefault) {
        onUpdatePrompt(name, content, editingPromptId);
      }
    }
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleDelete = () => {
    if (editingPromptId !== 'NEW') {
      const found = prompts.find(p => p.id === editingPromptId);
      if (found && !found.isDefault) {
        onDeletePrompt(editingPromptId);
        setEditingPromptId('NEW');
      }
    }
  };

  const activePrompt =
    editingPromptId === 'NEW'
      ? null
      : prompts.find(p => p.id === editingPromptId);
  const canEdit =
    editingPromptId === 'NEW' || (activePrompt && !activePrompt.isDefault);

  const renderPromptSelector = (
    label: string,
    value: string,
    onSelect: (id: string) => void
  ) => (
    <div className="jp-selenepy-promptSettings-controlGroup">
      <label>{label}</label>
      <select
        value={value}
        onChange={e => onSelect(e.target.value)}
        className="jp-selenepy-promptSelector"
      >
        {prompts.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="jp-selenepy-promptSettings">
      <header className="jp-selenepy-promptSettings-header">
        <button className="jp-selenepy-promptSettings-backBtn" onClick={onBack}>
          ← Back
        </button>
        <h2>Manage Prompts</h2>
      </header>

      {/* 1. Active Configuration Section */}
      <section className="jp-selenepy-promptSettings-section">
        <h3>Active Configuration</h3>
        {renderPromptSelector(
          'Local Suggestions Prompt:',
          selectedLocalPromptId,
          onSelectLocal
        )}
        {renderPromptSelector(
          'Global Suggestions Prompt:',
          selectedGlobalPromptId,
          onSelectGlobal
        )}
      </section>

      <hr className="jp-selenepy-promptSettings-divider" />

      {/* 2. Editor Section */}
      <section className="jp-selenepy-promptSettings-section">
        <h3>Prompt Editor</h3>

        <div className="jp-selenepy-promptSettings-controlGroup">
          <label>Edit Prompt:</label>
          <select
            value={editingPromptId}
            onChange={e => setEditingPromptId(e.target.value)}
            className="jp-selenepy-promptSelector"
          >
            <option value="NEW">➕ Create New Prompt...</option>
            <optgroup label="Existing Prompts">
              {prompts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
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
            {!canEdit && (
              <span className="jp-selenepy-infoText">
                Default prompt cannot be edited.
              </span>
            )}

            {saveStatus && (
              <span
                className="jp-selenepy-statusText"
                style={{
                  color: 'var(--jp-success-color1)',
                  marginRight: '8px'
                }}
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
                {editingPromptId === 'NEW' ? 'Create Prompt' : 'Save Changes'}
              </button>
            )}

            {editingPromptId !== 'NEW' && canEdit && (
              <button className="jp-selenepy-deleteBtn" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
