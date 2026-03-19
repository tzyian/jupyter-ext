import { buildDiffSegments } from '../diff';

describe('diff utility', () => {
  it('should handle identical strings', () => {
    const original = 'line 1\nline 2';
    const replacement = 'line 1\nline 2';
    const segments = buildDiffSegments(original, replacement);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      value: 'line 1',
      type: 'unchanged',
      lineNumberOriginal: 1,
      lineNumberNew: 1
    });
    expect(segments[1]).toEqual({
      value: 'line 2',
      type: 'unchanged',
      lineNumberOriginal: 2,
      lineNumberNew: 2
    });
  });

  it('should handle additions', () => {
    const original = 'line 1';
    const replacement = 'line 1\nline 2';
    const segments = buildDiffSegments(original, replacement);
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe('unchanged');
    expect(segments[1]).toEqual({
      value: 'line 2',
      type: 'added',
      lineNumberNew: 2
    });
  });

  it('should handle deletions', () => {
    const original = 'line 1\nline 2';
    const replacement = 'line 1';
    const segments = buildDiffSegments(original, replacement);
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe('unchanged');
    expect(segments[1]).toEqual({
      value: 'line 2',
      type: 'removed',
      lineNumberOriginal: 2
    });
  });

  it('should handle complex changes', () => {
    const original = 'line 1\nline 2\nline 3';
    const replacement = 'line 1\nline 2 modified\nline 4';
    const segments = buildDiffSegments(original, replacement);

    // Line 1: unchanged
    // Line 2: removed
    // Line 2 mod: added
    // Line 3: removed
    // Line 4: added

    const types = segments.map(s => s.type);
    expect(types).toContain('unchanged');
    expect(types).toContain('removed');
    expect(types).toContain('added');
  });

  it('should handle empty strings', () => {
    expect(buildDiffSegments('', '')).toEqual([]);
    expect(buildDiffSegments('', 'new')).toEqual([
      { value: 'new', type: 'added', lineNumberNew: 1 }
    ]);
  });
});
