import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

import type {
  IChatThread,
  INotebookSnapshot,
  IPrompt,
  PromptCategory,
  ISuggestedEditsSettings,
  IToolCall,
  SuggestionScanMode,
  SuggestionStreamEvent
} from '../types';

const PROMPTS_PATH = 'prompts';
const STREAM_PATH = 'suggestions/stream';
const CHAT_STREAM_PATH = 'chat/stream';
const CHAT_THREADS_PATH = 'chat/threads';

function getApiSettings(path: string): {
  url: string;
  settings: ServerConnection.ISettings;
} {
  const settings = ServerConnection.makeSettings();
  const url = URLExt.join(settings.baseUrl, 'selenepy', path);
  return { url, settings };
}

export async function fetchPrompts(): Promise<IPrompt[]> {
  const { url, settings } = getApiSettings(PROMPTS_PATH);

  const response = await ServerConnection.makeRequest(url, {}, settings);

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }

  const data = await response.json();
  return data.prompts;
}

export async function savePrompt(
  name: string,
  content: string,
  id?: string,
  description?: string,
  category: PromptCategory = 'suggestion'
): Promise<IPrompt> {
  const { url, settings } = getApiSettings(PROMPTS_PATH);

  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.init?.headers ?? {})
      },
      body: JSON.stringify({ name, content, id, description, category })
    },
    settings
  );

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }

  return response.json();
}

export async function deletePrompt(id: string): Promise<void> {
  const { url: baseUrl, settings } = getApiSettings(PROMPTS_PATH);
  const url = baseUrl + '?id=' + encodeURIComponent(id);

  const response = await ServerConnection.makeRequest(
    url,
    { method: 'DELETE' },
    settings
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
  const { url, settings } = getApiSettings(STREAM_PATH);

  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify({
      snapshot,
      settings: configuration,
      openaiApiKey: configuration.openaiApiKey,
      mode,
      promptId
    }),
    headers: {
      'Content-Type': 'application/json',
      ...(settings.init?.headers ?? {})
    },
    cache: 'no-store',
    credentials: settings.init?.credentials ?? 'same-origin',
    redirect: 'follow',
    signal
  };

  const response = await ServerConnection.makeRequest(url, init, settings);
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

/**
 * Stream chat from the backend server.
 */
export async function* streamChat(
  message: string,
  snapshot: INotebookSnapshot | null,
  clientSettings: import('../types').ISuggestedEditsSettings | null,
  signal?: AbortSignal,
  threadId?: string
): AsyncGenerator<import('../types').ChatStreamEvent> {
  const { url, settings } = getApiSettings(CHAT_STREAM_PATH);

  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify({
      message,
      snapshot,
      settings: clientSettings,
      openaiApiKey: clientSettings?.openaiApiKey ?? '',
      thread_id: threadId ?? null,
      chatSystemPrompt: clientSettings?.chatSystemPrompt ?? ''
    }),
    headers: {
      'Content-Type': 'application/json',
      ...(settings.init?.headers ?? {})
    },
    cache: 'no-store',
    credentials: settings.init?.credentials ?? 'same-origin',
    redirect: 'follow',
    signal
  };

  const response = await ServerConnection.makeRequest(url, init, settings);
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
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const parsed = parseChatEventLine(line);
        if (parsed) {
          yield parsed;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseChatEventLine(
  line: string
): import('../types').ChatStreamEvent | null {
  if (!line.startsWith('data:')) {
    return null;
  }

  const data = line.slice(5).trim();
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as import('../types').ChatStreamEvent;
  } catch (error) {
    console.warn('Failed to parse chat event line', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat Thread management
// ---------------------------------------------------------------------------

export async function fetchThreads(): Promise<IChatThread[]> {
  const { url, settings } = getApiSettings(CHAT_THREADS_PATH);
  const response = await ServerConnection.makeRequest(url, {}, settings);
  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
  const data = await response.json();
  return (
    data.threads as Array<{
      id: string;
      title: string;
      created_at: number;
      updated_at: number;
      message_count: number;
      last_response_duration?: number;
    }>
  ).map(t => ({
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    messageCount: t.message_count,
    lastResponseDuration: t.last_response_duration
  }));
}

/**
 * Create a new thread. Returns the created thread record.
 */
export async function createThread(title = 'New Chat'): Promise<IChatThread> {
  const { url, settings } = getApiSettings(CHAT_THREADS_PATH);
  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify({ title })
    },
    settings
  );
  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
  const t = await response.json();
  return {
    id: t.id,
    title: t.title,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    messageCount: t.message_count ?? 0,
    lastResponseDuration: t.last_response_duration
  };
}

export async function deleteThread(id: string): Promise<void> {
  const { url: base, settings } = getApiSettings(CHAT_THREADS_PATH);
  const url = `${base}?id=${encodeURIComponent(id)}`;
  const response = await ServerConnection.makeRequest(
    url,
    { method: 'DELETE' },
    settings
  );
  if (!response.ok && response.status !== 204) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
}

export async function updateThread(
  id: string,
  metadata: { title?: string; lastResponseDuration?: number }
): Promise<void> {
  const { url: base, settings } = getApiSettings(CHAT_THREADS_PATH);
  const url = `${base}?id=${encodeURIComponent(id)}`;
  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'PATCH',
      body: JSON.stringify({
        title: metadata.title,
        last_response_duration: metadata.lastResponseDuration
      })
    },
    settings
  );
  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
}

export async function renameThread(id: string, title: string): Promise<void> {
  return updateThread(id, { title });
}

export async function fetchThreadMessages(
  threadId: string
): Promise<import('../types').IChatMessage[]> {
  const path = `chat/threads/${encodeURIComponent(threadId)}/messages`;
  const { url, settings } = getApiSettings(path);
  const response = await ServerConnection.makeRequest(url, {}, settings);
  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, await response.text());
  }
  const data = await response.json();
  return (
    data.messages as Array<{
      id: string;
      thread_id: string;
      role: string;
      content: string;
      timestamp?: number | null;
      thoughts?: Array<{ agent: string; content: string }>;
      toolCalls?: IToolCall[];
    }>
  ).map(m => ({
    id: m.id,
    role: m.role as 'user' | 'ai',
    content: m.content,
    threadId: m.thread_id,
    timestamp: typeof m.timestamp === 'number' ? m.timestamp : undefined,
    thoughts: Array.isArray(m.thoughts) ? m.thoughts : undefined,
    toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : undefined
  }));
}

export async function transcribeAudio(
  audioBlob: Blob,
  openaiApiKey?: string
): Promise<string> {
  const { url, settings } = getApiSettings('transcribe');

  const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
  const file = new File([audioBlob], 'audio.webm', { type: mimeType });

  const formData = new FormData();
  formData.append('audio', file, file.name);
  if (openaiApiKey) {
    formData.append('openaiApiKey', openaiApiKey);
  }

  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      body: formData
    },
    settings
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new ServerConnection.ResponseError(response, errorText);
  }

  const data = await response.json();
  return data.text;
}
