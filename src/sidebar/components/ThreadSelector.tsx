import React, { useCallback } from 'react';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import type { IChatThread } from '../../types';

interface IThreadSelectorProps {
  threads: IChatThread[];
  activeThreadId: string | null;
  threadsLoaded: boolean;
  isStreaming: boolean;
  onSelectThread: (id: string) => void;
  onCreateThread: () => void;
  onDeleteThread: () => void;
  onRenameThread: () => void;
}

function formatLastEdited(timestampSeconds: number): string {
  const timestampMs = timestampSeconds * 1000;
  const diffMs = Date.now() - timestampMs;

  if (diffMs < 60 * 1000) {
    return 'just now';
  }

  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.floor(diffMs / (60 * 1000));
    return `${mins}m ago`;
  }

  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }

  return new Date(timestampMs).toLocaleDateString();
}

/**
 * Compact thread selector bar rendered at the top of the chat view.
 */
export const ThreadSelector: React.FC<IThreadSelectorProps> = ({
  threads,
  activeThreadId,
  threadsLoaded,
  isStreaming,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onRenameThread
}) => {
  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSelectThread(e.target.value);
    },
    [onSelectThread]
  );

  const handleDeleteClick = useCallback(async () => {
    if (!activeThread) {
      return;
    }
    const result = await showDialog({
      title: 'Delete Thread',
      body: `Delete thread "${activeThread.title}"? This cannot be undone.`,
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Delete' })]
    });
    if (result.button.accept) {
      onDeleteThread();
    }
  }, [activeThread, onDeleteThread]);

  return (
    <div className="jp-selenepy-threadSelector">
      <select
        value={activeThreadId ?? ''}
        onChange={handleSelectChange}
        disabled={!threadsLoaded || isStreaming}
        title="Select chat thread"
        className="jp-selenepy-threadSelector-select"
      >
        {!threadsLoaded && <option value="">Loading chat history…</option>}
        {threadsLoaded && threads.length === 0 && (
          <option value="">No chat history</option>
        )}
        {threads.map(t => (
          <option
            key={t.id}
            value={t.id}
            title={`Last edited: ${new Date(t.updatedAt * 1000).toLocaleString()}`}
          >
            {`${t.title} (${t.messageCount}) - ${formatLastEdited(t.updatedAt)}`}
          </option>
        ))}
      </select>

      <button
        title="New thread"
        onClick={onCreateThread}
        disabled={isStreaming}
        className="jp-selenepy-action-button jp-selenepy-threadSelector-btn"
      >
        +
      </button>

      {activeThread && (
        <>
          <button
            title="Rename this thread"
            onClick={onRenameThread}
            disabled={isStreaming}
            className="jp-selenepy-action-button jp-selenepy-threadSelector-btn"
          >
            ✎
          </button>
          <button
            title="Delete this thread"
            onClick={() => void handleDeleteClick()}
            disabled={isStreaming}
            className="jp-selenepy-action-button jp-selenepy-action-button-danger jp-selenepy-threadSelector-btn"
          >
            🗑
          </button>
        </>
      )}
    </div>
  );
};
