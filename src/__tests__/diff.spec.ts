import { buildDiffSegments } from '../sidebar/utils/diff';

describe('buildDiffSegments', () => {
  test('returns unchanged segments when identical', () => {
    const original = 'line1\nline2';
    const segs = buildDiffSegments(original, original);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({
      value: 'line1',
      type: 'unchanged',
      lineNumberOriginal: 1,
      lineNumberNew: 1
    });
    expect(segs[1]).toMatchObject({
      value: 'line2',
      type: 'unchanged',
      lineNumberOriginal: 2,
      lineNumberNew: 2
    });
  });

  test('handles added and removed lines', () => {
    const original = 'a\nb\nc';
    const replacement = 'a\nX\nc';
    const segs = buildDiffSegments(original, replacement);
    // should contain removed 'b', added 'X', and unchanged 'a'/'c'
    const types = segs.map(s => s.type);
    expect(types).toEqual(
      expect.arrayContaining(['unchanged', 'removed', 'added'])
    );
  });
});
