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
export function formatLastEdited(timestampSeconds: number): string {
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
