import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

import type {
  INotebookSnapshot,
  ISuggestedEditsSettings,
  SuggestionScanMode,
  SuggestionStreamEvent
} from '../types';

const STREAM_PATH = 'suggestions/stream';

/**
 * Stream suggestions from the backend server.
 *
 * @param snapshot - The notebook snapshot to analyze.
 * @param configuration - The extension settings.
 * @param mode - The scan mode ('context' or 'full').
 * @param signal - An optional abort signal.
 * @returns An async generator of suggestion events.
 */
export async function* streamSuggestions(
  snapshot: INotebookSnapshot,
  configuration: ISuggestedEditsSettings,
  mode: SuggestionScanMode,
  signal?: AbortSignal
): AsyncGenerator<SuggestionStreamEvent> {
  const connectionSettings = ServerConnection.makeSettings();
  const url = URLExt.join(connectionSettings.baseUrl, 'selenepy', STREAM_PATH);

  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify({ snapshot, settings: configuration, mode }),
    headers: {
      'Content-Type': 'application/json',
      ...(connectionSettings.init?.headers ?? {})
    },
    cache: 'no-store',
    credentials: connectionSettings.init?.credentials ?? 'same-origin',
    redirect: 'follow',
    signal
  };

  const response = await ServerConnection.makeRequest(
    url,
    init,
    connectionSettings
  );
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new ServerConnection.ResponseError(response, text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseEvent(rawEvent);
        if (parsed) {
          yield parsed;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }

    // Flush remaining buffer if it contains a final event without trailing newline
    const remainder = buffer.trim();
    if (remainder) {
      const parsed = parseEvent(remainder);
      if (parsed) {
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a raw SSE event payload.
 */
function parseEvent(payload: string): SuggestionStreamEvent | null {
  const lines = payload.split(/\n/);
  let eventType = 'message';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      const value = line.slice(5).trim();
      data += value;
    }
  }

  if (!data) {
    return null;
  }

  try {
    const json = JSON.parse(data) as SuggestionStreamEvent;
    if (json && 'type' in json) {
      return json;
    }
  } catch (error) {
    console.warn('Failed to parse suggestion event', error);
  }

  switch (eventType) {
    case 'status':
      if (data === 'started' || data === 'complete') {
        return { type: 'status', phase: data };
      }
      break;
    case 'info':
      return { type: 'info', message: data };
    default:
      break;
  }
  return null;
}
