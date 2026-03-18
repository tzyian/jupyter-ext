import { formatDuration, formatRelativeTime } from '../utils/formatting';

describe('formatting utils', () => {
  test('formatDuration returns minutes for small values', () => {
    expect(formatDuration(90)).toBe('1m');
  });

  test('formatDuration returns hours and minutes', () => {
    expect(formatDuration(3720)).toBe('1h 2m');
  });

  test('formatRelativeTime produces expected labels', () => {
    const now = 1600000000000; // ms
    const realNow = Date.now;
    // @ts-ignore
    global.Date.now = () => now;

    const tsJustNow = now / 1000 - 30; // 30 seconds ago
    expect(formatRelativeTime(tsJustNow)).toBe('Just now');

    const tsMinutes = now / 1000 - 120; // 2 minutes ago
    expect(formatRelativeTime(tsMinutes)).toBe('2m ago');

    const tsHours = now / 1000 - 7200; // 2 hours ago
    expect(formatRelativeTime(tsHours)).toBe('2h ago');

    const tsDays = now / 1000 - 172800; // 2 days ago
    expect(formatRelativeTime(tsDays)).toBe('2d ago');

    // restore
    // @ts-ignore
    global.Date.now = realNow;
  });
});
