import React, { useCallback } from 'react';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import type { IChatThread } from '../../../types';
import { MdDelete, MdEdit } from 'react-icons/md';
import { formatLastEdited } from '../../../utils/formatting';

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
            <MdEdit />
          </button>
          <button
            title="Delete this thread"
            onClick={() => void handleDeleteClick()}
            disabled={isStreaming}
            className="jp-selenepy-action-button jp-selenepy-action-button-danger jp-selenepy-threadSelector-btn"
          >
            <MdDelete />
          </button>
        </>
      )}
    </div>
  );
};
