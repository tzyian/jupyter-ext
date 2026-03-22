import React, { useState } from 'react';
import type {
  IResolvedSuggestion,
  SuggestionContextType,
  IReadonlyDiffSegment
} from '../../../types';

export interface ISuggestionCardProps {
  suggestion: IResolvedSuggestion;
  type: SuggestionContextType;
  localIndex?: number;
  onApply: (suggestion: IResolvedSuggestion) => void;
  onDismiss: (suggestion: IResolvedSuggestion, index?: number) => void;
}

export const SuggestionCard: React.FC<ISuggestionCardProps> = ({
  suggestion,
  type,
  localIndex,
  onApply,
  onDismiss
}) => {
  const [view, setView] = useState<'original' | 'proposed' | 'diff'>('diff');

  const renderDiffTable = (segments: IReadonlyDiffSegment[]) => {
    return (
      <table className="jp-selenepy-diff-table">
        <tbody>
          {segments.map((segment, idx) => (
            <tr
              key={idx}
              className={`jp-selenepy-diff-row jp-selenepy-diff-row-${segment.type}`}
            >
              <td className="jp-selenepy-diff-ln jp-selenepy-diff-ln-old">
                {segment.lineNumberOriginal ?? ''}
              </td>
              <td className="jp-selenepy-diff-ln jp-selenepy-diff-ln-new">
                {segment.lineNumberNew ?? ''}
              </td>
              <td className="jp-selenepy-diff-gutter">
                {segment.type === 'added'
                  ? '+'
                  : segment.type === 'removed'
                    ? '-'
                    : segment.type === 'modified'
                      ? '~'
                      : ' '}
              </td>
              <td className="jp-selenepy-diff-code">{segment.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <article className="jp-selenepy-suggestedEdits-item">
      <div className="jp-selenepy-suggestedEdits-item-body">
        <h3>{suggestion.title}</h3>
        <p>{suggestion.description}</p>

        {suggestion.rationale && (
          <pre className="jp-selenepy-rationale">{suggestion.rationale}</pre>
        )}

        <div className="jp-selenepy-view-toggle">
          {(['original', 'proposed', 'diff'] as const).map(v => (
            <button
              key={v}
              type="button"
              className={`jp-selenepy-toggle-button ${view === v ? 'jp-mod-active' : ''}`}
              onClick={() => setView(v)}
            >
              {v.charAt(0) ? v.charAt(0).toUpperCase() + v.slice(1) : v}
            </button>
          ))}
        </div>

        <div className="jp-selenepy-suggestion-preview">
          {view === 'original' && (
            <pre className="jp-selenepy-preview-original">
              {suggestion.originalSource}
            </pre>
          )}
          {view === 'proposed' && (
            <pre className="jp-selenepy-preview-proposed">
              {suggestion.replacementSource}
            </pre>
          )}
          {view === 'diff' && renderDiffTable(suggestion.diffSegments)}
        </div>
      </div>

      <div className="jp-selenepy-suggestedEdits-item-controls">
        <button
          className="jp-selenepy-suggestedEdits-actionButton jp-mod-active"
          onClick={() => onApply(suggestion)}
        >
          Apply
        </button>
        <button
          className="jp-selenepy-suggestedEdits-actionButton"
          onClick={() => onDismiss(suggestion, localIndex)}
        >
          Dismiss
        </button>
      </div>
    </article>
  );
};
