import * as diff from 'diff';
import type { IReadonlyDiffSegment } from '../types';

/**
 * Build diff segments between original and replacement text.
 */
export function buildDiffSegments(
  original: string,
  replacement: string
): IReadonlyDiffSegment[] {
  if (original === replacement) {
    return original
      ? original.split(/\r?\n/).map((line, i) => ({
          value: line,
          type: 'unchanged',
          lineNumberOriginal: i + 1,
          lineNumberNew: i + 1
        }))
      : [];
  }

  const changes = diff.diffLines(original, replacement);
  const segments: IReadonlyDiffSegment[] = [];

  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = change.value.split(/\r?\n/);
    if (lines[lines.length - 1] === '') {
      lines.pop(); // Remove trailing empty string from split if it exists
    }

    if (change.added && !change.removed) {
      // Check if previous was removed to mark as modified
      const prev = segments[segments.length - 1];
      if (prev && prev.type === 'removed') {
        // Simple heuristic: if we just removed lines and now added lines,
        // we can't easily map them 1:1 here without deeper logic,
        // but for the UI we'll just keep them as added/removed for now
        // unless we want to implement a more complex 'modified' detector.
        // For now, let's just stick to added/removed as it's clearer for multi-line blocks.
      }

      for (const line of lines) {
        segments.push({
          value: line,
          type: 'added',
          lineNumberNew: newLine++
        });
      }
    } else if (change.removed && !change.added) {
      for (const line of lines) {
        segments.push({
          value: line,
          type: 'removed',
          lineNumberOriginal: oldLine++
        });
      }
    } else {
      for (const line of lines) {
        segments.push({
          value: line,
          type: 'unchanged',
          lineNumberOriginal: oldLine++,
          lineNumberNew: newLine++
        });
      }
    }
  }

  return segments;
}
