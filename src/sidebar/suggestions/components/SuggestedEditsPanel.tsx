import React from 'react';
import { SuggestionCard } from './SuggestionCard';
import type { IResolvedSuggestion } from '../types';

export interface ISuggestedEditsPanelProps {
  status: string;
  isPaused: boolean;
  localSuggestions: (IResolvedSuggestion | null)[];
  globalSuggestion: IResolvedSuggestion | null;
  onRefreshContext: () => void;
  onRefreshFull: () => void;
  onPauseToggle: () => void;
  onApply: (suggestion: IResolvedSuggestion) => void;
  onDismiss: (suggestion: IResolvedSuggestion, index?: number) => void;
  onOpenSettings: () => void;
  hasApiKey: boolean;
}

export const SuggestedEditsPanel: React.FC<ISuggestedEditsPanelProps> = ({
  status,
  isPaused,
  localSuggestions,
  globalSuggestion,
  onRefreshContext,
  onRefreshFull,
  onPauseToggle,
  onApply,
  onDismiss,
  onOpenSettings,
  hasApiKey
}) => {
  return (
    <div className="jp-selenepy-suggestedEdits-container">
      <header className="jp-selenepy-suggestedEdits-header">
        <div className="jp-selenepy-suggestedEdits-buttonGroup">
          <button
            className="jp-selenepy-action-button js-primary-suggestions"
            onClick={onRefreshContext}
          >
            Refresh (context)
          </button>
          <button
            className="jp-selenepy-action-button js-primary-suggestions"
            onClick={onRefreshFull}
          >
            Refresh (full)
          </button>
          <button className="jp-selenepy-action-button" onClick={onPauseToggle}>
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>

      {!hasApiKey && (
        <div className="jp-selenepy-warning-box">
          <strong>Missing API Key:</strong> Please set your OpenAI API Key in
          the JupyterLab Advanced Settings under 'selenejs' to use live
          suggestions.
        </div>
      )}

      <div className="jp-selenepy-suggestedEdits-status">{status}</div>

      <section className="jp-selenepy-suggestedEdits-localSection">
        <h3 className="jp-selenepy-suggestedEdits-sectionHeader">
          Local Context Suggestions (auto updates)
        </h3>
        <div className="jp-selenepy-suggestedEdits-slotGroup">
          {localSuggestions.map((suggestion, idx) => (
            <div key={idx} className="jp-selenepy-suggestedEdits-slot">
              {suggestion ? (
                <SuggestionCard
                  suggestion={suggestion}
                  type="local"
                  localIndex={idx}
                  onApply={onApply}
                  onDismiss={onDismiss}
                />
              ) : (
                <p className="jp-selenepy-suggestedEdits-slot-empty">
                  Local suggestions will appear here.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="jp-selenepy-suggestedEdits-globalSection">
        <h3 className="jp-selenepy-suggestedEdits-sectionHeader">
          Global Notebook Suggestion (manual refresh)
        </h3>
        <div className="jp-selenepy-suggestedEdits-slot">
          {globalSuggestion ? (
            <SuggestionCard
              suggestion={globalSuggestion}
              type="global"
              onApply={onApply}
              onDismiss={onDismiss}
            />
          ) : (
            <p className="jp-selenepy-suggestedEdits-slot-empty">
              Global suggestion will appear here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
