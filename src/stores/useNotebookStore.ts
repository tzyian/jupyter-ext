import { create } from 'zustand';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

interface INotebookState {
  currentWidget: NotebookPanel | null;
  activeCellIndex: number;
  selectedText: string;
  isNotebookBusy: boolean;
  notebookPath: string;

  // Actions
  setNotebook: (widget: NotebookPanel | null) => void;
  setActiveCellIndex: (index: number) => void;
  setSelectedText: (text: string) => void;
  setBusy: (busy: boolean) => void;
  setNotebookPath: (path: string) => void;
}

/**
 * Global store for the active notebook context.
 * Acts as a bridge between Lumino Signals and Zustand.
 */
export const useNotebookStore = create<INotebookState>(set => ({
  currentWidget: null,
  activeCellIndex: -1,
  selectedText: '',
  isNotebookBusy: false,
  notebookPath: '',

  setNotebook: widget => set({ currentWidget: widget }),
  setActiveCellIndex: index => set({ activeCellIndex: index }),
  setSelectedText: text => set({ selectedText: text }),
  setBusy: busy => set({ isNotebookBusy: busy }),
  setNotebookPath: path => set({ notebookPath: path })
}));

/**
 * Initialize the notebook store tracker.
 * This should be called once in the plugin activation function.
 */
export function initNotebookStore(tracker: INotebookTracker): void {
  const store = useNotebookStore.getState();

  const onNotebookChanged = () => {
    const widget = tracker.currentWidget;
    store.setNotebook(widget);
    store.setNotebookPath(widget?.context.path ?? '');

    if (widget) {
      store.setActiveCellIndex(widget.content.activeCellIndex);
      // Connect to session status for busy state
      widget.sessionContext.statusChanged.connect((_, status) => {
        store.setBusy(status === 'busy');
      });
      // Connect to active cell changes
      widget.content.activeCellChanged.connect(() => {
        store.setActiveCellIndex(widget.content.activeCellIndex);
      });
    }
  };

  const onSelectionChange = () => {
    const selection =
      typeof document !== 'undefined' ? document.getSelection() : null;
    const text = selection?.toString() ?? '';
    store.setSelectedText(text);
  };

  tracker.currentChanged.connect(onNotebookChanged);
  if (typeof document !== 'undefined') {
    document.addEventListener('selectionchange', onSelectionChange);
  }

  // Initial update
  onNotebookChanged();
}
