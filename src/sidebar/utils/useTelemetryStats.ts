import { useState, useEffect } from 'react';
import type { ITelemetryStats } from '../../telemetry/types';

/**
 * Custom hook to manage telemetry stats fetching and polling.
 *
 * @param fetchStats Function to call for fetching stats.
 * @param refreshInterval ms between refreshes. Default 30s.
 */
export function useTelemetryStats(
  fetchStats: (notebookPath?: string) => Promise<ITelemetryStats | null>,
  refreshInterval = 5000
) {
  const [stats, setStats] = useState<ITelemetryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<string>('');

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const notebookPath = selectedNotebook || undefined;
        const data = await fetchStats(notebookPath);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    void loadStats();
    const interval = setInterval(loadStats, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchStats, selectedNotebook, refreshInterval]);

  return {
    stats,
    loading,
    error,
    selectedNotebook,
    setSelectedNotebook
  };
}
