import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

import type {
  INotebookSnapshot,
  IPrompt,
  ISuggestedEditsSettings,
  SuggestionScanMode,
  SuggestionStreamEvent
} from '../types';


const PROMPTS_PATH = 'prompts';
const STREAM_PATH = 'suggestions/stream';

export async function fetchPrompts(): Promise<IPrompt[]> {
  const connectionSettings = ServerConnection.makeSettings();
  const url = URLExt.join(connectionSettings.baseUrl, 'selenepy', PROMPTS_PATH);

  const response = await ServerConnection.makeRequest(
    url,
    {},
    connectionSettings
  );

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }

  const data = await response.json();
  return data.prompts;
}

export async function savePrompt(
  name: string,
  content: string,
  id?: string
): Promise<IPrompt> {
  const connectionSettings = ServerConnection.makeSettings();
  const url = URLExt.join(connectionSettings.baseUrl, 'selenepy', PROMPTS_PATH);

  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify({ name, content, id })
    },
    connectionSettings
  );

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }

  return response.json();
}

export async function deletePrompt(id: string): Promise<void> {
  const connectionSettings = ServerConnection.makeSettings();
  const url =
    URLExt.join(connectionSettings.baseUrl, 'selenepy', PROMPTS_PATH) +
    '?id=' +
    encodeURIComponent(id);

  const response = await ServerConnection.makeRequest(
    url,
    { method: 'DELETE' },
    connectionSettings
  );

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
}

/**
 * Stream suggestions from the backend server.
 */
export async function* streamSuggestions(
  snapshot: INotebookSnapshot,
  configuration: ISuggestedEditsSettings,
  mode: SuggestionScanMode,
  promptId: string,
  signal?: AbortSignal
): AsyncGenerator<SuggestionStreamEvent> {
  const connectionSettings = ServerConnection.makeSettings();
  const url = URLExt.join(connectionSettings.baseUrl, 'selenepy', STREAM_PATH);

  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify({ snapshot, settings: configuration, mode, promptId }),
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
  let lineBuffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      lineBuffer += chunk;

      const lines = lineBuffer.split(/\r?\n/);
      // Keep the last partial line in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const parsed = parseEventLine(line);
        if (parsed) {
          yield parsed;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE data line.
 */
function parseEventLine(line: string): SuggestionStreamEvent | null {
  if (!line.startsWith('data:')) {
    return null;
  }

  const data = line.slice(5).trim();
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as SuggestionStreamEvent;
  } catch (error) {
    console.warn('Failed to parse suggestion event line', error);
    return null;
  }
}
