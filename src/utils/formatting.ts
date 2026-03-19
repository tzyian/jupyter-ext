/**
 * Format a duration in seconds to a human-readable string (e.g. "1h 30m" or "45m").
 */
export const formatDuration = (seconds: number | undefined): string => {
  if (seconds === undefined) {
    return 'No data available';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Format a timestamp as a relative time string (e.g. "5m ago", "Just now").
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) {
    return 'Just now';
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  }
  return `${Math.floor(diff / 86400)}d ago`;
};
