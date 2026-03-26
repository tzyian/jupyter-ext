import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import updateLocale from 'dayjs/plugin/updateLocale';

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(updateLocale);

dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s ago',
    s: 'a few seconds',
    m: '1m',
    mm: '%dm',
    h: '1h',
    hh: '%dh',
    d: '1d',
    dd: '%dd',
    M: '1mo',
    MM: '%dmo',
    y: '1y',
    yy: '%dy'
  }
});

/**
 * Format a duration in seconds to a human-readable string (e.g. "1h 30m" or "45m").
 */
export const formatDuration = (seconds: number | undefined): string => {
  if (seconds === undefined) {
    return 'No data available';
  }

  const d = dayjs.duration(seconds, 'seconds');
  const hours = Math.floor(d.asHours());
  const minutes = d.minutes();

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Format a timestamp as a relative time string (e.g. "5m ago", "Just now").
 */
export const formatRelativeTime = (timestamp: number): string => {
  const d = dayjs.unix(timestamp);
  const diff = dayjs().diff(d, 'second');

  if (diff < 60) {
    return 'Just now';
  }

  return d.fromNow();
};

/**
 * Format last edited time.
 */
export function formatLastEdited(timestampSeconds: number): string {
  const d = dayjs.unix(timestampSeconds);
  const diff = dayjs().diff(d, 'second');

  if (diff < 60) {
    return 'just now';
  }

  // dayjs.fromNow() handles minutes, hours, days
  if (diff < 7 * 24 * 60 * 60) {
    return d.fromNow();
  }

  return d.format('L');
}

/**
 * Format message time.
 */
export function formatMessageTime(timestamp?: number): string {
  if (
    timestamp === null ||
    timestamp === undefined ||
    !Number.isFinite(timestamp)
  ) {
    return '--';
  }

  // Handle both seconds and milliseconds
  const d = dayjs(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
  return d.format('D MMM, h:mm A');
}
