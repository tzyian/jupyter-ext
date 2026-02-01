import { buildSnapshot } from '../snapshot';
import type { NotebookPanel } from '@jupyterlab/notebook';

describe('snapshot utility', () => {
  let mockPanel: any;

  beforeEach(() => {
    mockPanel = {
      context: { path: 'test.ipynb' },
      content: {
        activeCellIndex: 0,
        activeCell: {
          editor: {
            getCursorPosition: () => ({ line: 0, column: 5 }),
            getOffsetAt: () => 5,
            getSelection: () => null
          },
          model: {
            sharedModel: {
              getSource: () => 'print("hello")'
            }
          }
        },
        model: {
          cells: {
            length: 1,
            get: (index: number) => ({
              type: 'code',
              sharedModel: {
                getSource: () => 'print("hello")'
              },
              metadata: {
                toJSON: () => ({})
              }
            })
          }
        }
      }
    };
  });

  it('should build a valid snapshot', () => {
    const snapshot = buildSnapshot(mockPanel as unknown as NotebookPanel, 100);
    expect(snapshot.path).toBe('test.ipynb');
    expect(snapshot.cells).toHaveLength(1);
    expect(snapshot.cells[0].source).toBe('print("hello")');
    expect(snapshot.activeCellIndex).toBe(0);
  });

  it('should truncate long cell sources', () => {
    mockPanel.content.model.cells.get = () => ({
      type: 'code',
      sharedModel: {
        getSource: () => 'a'.repeat(200)
      },
      metadata: { toJSON: () => ({}) }
    });

    const snapshot = buildSnapshot(mockPanel as unknown as NotebookPanel, 100);
    expect(snapshot.cells[0].source.length).toBe(101); // 100 + '…'
    expect(snapshot.cells[0].source.endsWith('…')).toBe(true);
  });

  it('should extract outline from markdown cells', () => {
    mockPanel.content.model.cells.length = 1;
    mockPanel.content.model.cells.get = () => ({
      type: 'markdown',
      sharedModel: {
        getSource: () => '# Header 1\n## Header 2'
      },
      metadata: { toJSON: () => ({}) }
    });

    const snapshot = buildSnapshot(mockPanel as unknown as NotebookPanel, 100);
    expect(snapshot.outline).toHaveLength(1); // It only takes the first header of the cell due to the break in the loop
    expect(snapshot.outline[0]).toEqual({
      level: 1,
      text: 'Header 1',
      cellIndex: 0
    });
  });
});
