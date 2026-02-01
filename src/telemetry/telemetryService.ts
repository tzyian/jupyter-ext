import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { ITelemetryEvent, ITelemetryStats } from './types';

/**
 * Central telemetry service for batching and sending events to the backend.
 */
export class TelemetryService {
  private readonly _eventBuffer: ITelemetryEvent[] = [];
  private _flushTimer: number | null = null;
  private readonly _batchSize = 50;
  private readonly _flushIntervalMs = 5000; // 5 seconds

  constructor(private readonly _serverSettings?: ServerConnection.ISettings) {}

  /**
   * Log a telemetry event. Events are batched and sent periodically.
   */
  logEvent(type: string, metadata?: Record<string, any>): void {
    const event: ITelemetryEvent = {
      type,
      timestamp: Date.now() / 1000, // Unix timestamp in seconds
      metadata
    };

    this._eventBuffer.push(event);
    console.log(
      `[Telemetry] Event logged: ${type}, buffer size: ${this._eventBuffer.length}`,
      metadata
    );

    // Flush immediately if buffer is full
    if (this._eventBuffer.length >= this._batchSize) {
      console.log(
        `[Telemetry] Buffer full (${this._eventBuffer.length}), flushing immediately`
      );
      void this.flush();
    } else {
      this._scheduleFlush();
    }
  }

  /**
   * Manually flush all buffered events to the server.
   */
  async flush(): Promise<void> {
    if (this._eventBuffer.length === 0) {
      return;
    }

    const events = this._eventBuffer.splice(0);
    this._clearFlushTimer();

    console.log(`[Telemetry] Flushing ${events.length} events to backend`);

    try {
      const settings = this._serverSettings ?? ServerConnection.makeSettings();
      const url = URLExt.join(settings.baseUrl, 'selenepy', 'telemetry');

      console.log(`[Telemetry] Sending POST to ${url}`);

      const response = await ServerConnection.makeRequest(
        url,
        {
          method: 'POST',
          body: JSON.stringify({ events })
        },
        settings
      );

      if (!response.ok) {
        console.error(
          '[Telemetry] Failed to send telemetry events:',
          response.statusText
        );
      } else {
        const result = await response.json();
        console.log(
          `[Telemetry] Flush successful: ${result.inserted} events inserted`
        );
      }
    } catch (error) {
      console.error('[Telemetry] Flush error:', error);
      // Re-add events to buffer on failure
      this._eventBuffer.unshift(...events);
    }
  }

  /**
   * Fetch aggregated statistics from the backend.
   */
  async getStats(
    startTime?: number,
    endTime?: number
  ): Promise<ITelemetryStats | null> {
    try {
      const settings = this._serverSettings ?? ServerConnection.makeSettings();
      const baseUrl = URLExt.join(settings.baseUrl, 'selenepy', 'telemetry');

      const params = new URLSearchParams();
      if (startTime) {
        params.set('start_time', startTime.toString());
      }
      if (endTime) {
        params.set('end_time', endTime.toString());
      }

      const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;

      const response = await ServerConnection.makeRequest(
        url,
        { method: 'GET' },
        settings
      );

      if (!response.ok) {
        console.error('Failed to fetch telemetry stats:', response.statusText);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Telemetry stats fetch error:', error);
      return null;
    }
  }

  /**
   * Dispose of the service and flush remaining events.
   */
  dispose(): void {
    this._clearFlushTimer();
    void this.flush();
  }

  private _scheduleFlush(): void {
    if (this._flushTimer !== null) {
      return;
    }

    console.log(
      `[Telemetry] Scheduling flush in ${this._flushIntervalMs / 1000}s`
    );
    this._flushTimer = window.setTimeout(() => {
      void this.flush();
    }, this._flushIntervalMs);
  }

  private _clearFlushTimer(): void {
    if (this._flushTimer !== null) {
      window.clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }
}
