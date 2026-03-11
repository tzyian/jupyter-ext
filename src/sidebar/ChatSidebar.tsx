import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import { ChatPanel } from './components/ChatPanel';
import { streamChat } from './api';
import type {
  IChatMessage,
  INotebookSnapshot,
  ISuggestedEditsSettings
} from '../types';
import type { INotebookTracker } from '@jupyterlab/notebook';

export class ChatSidebar extends ReactWidget {
  private _messages: IChatMessage[] = [];
  private _isStreaming = false;
  private _tracker: INotebookTracker | null = null;
  private _abortController: AbortController | null = null;
  private _settings: ISuggestedEditsSettings | null = null;

  constructor(tracker?: INotebookTracker) {
    super();
    this.id = 'selenejs-chat-sidebar';
    this.addClass('jp-selenepy-chat');
    this.title.label = 'Chat';
    this.title.caption = 'LangGraph Chat';
    this.title.iconClass = 'jp-CodeConsoleIcon';
    if (tracker) {
      this._tracker = tracker;
    }
  }

  setSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    this.update();
  }

  private _getSnapshot(): INotebookSnapshot | null {
    if (!this._tracker || !this._tracker.currentWidget) {
      return null;
    }
    const currentWidget = this._tracker.currentWidget;
    const activeCellIndex = currentWidget.content.activeCellIndex;

    return {
      path: currentWidget.context.path,
      activeCellIndex,
      outline: [],
      cells: [],
      lastActivity: new Date().toISOString()
    };
  }

  private async _handleSendMessage(content: string) {
    const userMsgId = Date.now().toString();
    this._messages.push({ id: userMsgId, role: 'user', content });

    const agentMsgId = (Date.now() + 1).toString();
    this._messages.push({ id: agentMsgId, role: 'ai', content: '' });

    this._isStreaming = true;
    this.update();

    this._abortController = new AbortController();

    try {
      const stream = streamChat(
        content,
        this._getSnapshot(),
        this._settings,
        this._abortController.signal
      );

      for await (const event of stream) {
        if (event.type === 'chunk') {
          const aiMsg = this._messages[this._messages.length - 1];
          if (aiMsg && aiMsg.role === 'ai') {
            this._messages[this._messages.length - 1] = {
              ...aiMsg,
              content: aiMsg.content + event.content
            };
            this.update();
          }
        } else if (event.type === 'error') {
          console.error('Chat error:', event.message);
          const aiMsg = this._messages[this._messages.length - 1];
          if (aiMsg && aiMsg.role === 'ai') {
            this._messages[this._messages.length - 1] = {
              ...aiMsg,
              content: aiMsg.content + `\n[Error: ${event.message}]`
            };
          }
          this.update();
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to stream chat:', err);
        const aiMsg = this._messages[this._messages.length - 1];
        if (aiMsg && aiMsg.role === 'ai') {
          this._messages[this._messages.length - 1] = {
            ...aiMsg,
            content: aiMsg.content + `\n[Stream Error: ${err.message}]`
          };
        }
      }
    } finally {
      this._isStreaming = false;
      this._abortController = null;
      this.update();
    }
  }

  private _handleClear() {
    if (this._abortController) {
      this._abortController.abort();
    }
    this._messages = [];
    this._isStreaming = false;
    this.update();
  }

  protected render(): JSX.Element {
    return (
      <ChatPanel
        messages={this._messages}
        isStreaming={this._isStreaming}
        onSendMessage={msg => void this._handleSendMessage(msg)}
        onClear={() => this._handleClear()}
        hasApiKey={!!this._settings?.openaiApiKey}
      />
    );
  }
}
