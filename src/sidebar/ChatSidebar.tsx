import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import {
  streamChat,
  fetchThreads,
  createThread,
  deleteThread,
  fetchThreadMessages
} from './api';
import type {
  IChatMessage,
  IChatThread,
  INotebookSnapshot,
  ISuggestedEditsSettings,
  IPrompt
} from '../types';
import type { INotebookTracker } from '@jupyterlab/notebook';
import { Menu } from '@lumino/widgets';
import { buildSnapshot } from './utils/snapshot';
import { CommandIDs } from './commands';
import { ChatSidebarContent } from './components/ChatSidebarContent';

export class ChatSidebar extends ReactWidget {
  private _messages: IChatMessage[] = [];
  private _threads: IChatThread[] = [];
  private _activeThreadId: string | null = null;
  private _threadsLoaded = false;
  private _isStreaming = false;
  private _tracker: INotebookTracker | null = null;
  private _abortController: AbortController | null = null;
  private _settings: ISuggestedEditsSettings | null = null;
  private _view: 'chat' | 'chat_snippet' | 'context_menu' = 'chat';
  private _prompts: IPrompt[] = [];
  private _chatMenu: Menu | null = null;
  private _selectedSnippetId: string = '__CREATE_NEW__';
  private _selectedContextMenuId: string = '__CREATE_NEW__';
  private _menuFingerprint = '';
  private _onDocumentSelectionChange = () => {
    const notebookNode = this._tracker?.currentWidget?.content.node;
    const selection =
      typeof document !== 'undefined' ? document.getSelection() : null;
    const anchorNode = selection?.anchorNode ?? null;
    const focusNode = selection?.focusNode ?? null;

    if (
      notebookNode &&
      anchorNode &&
      focusNode &&
      notebookNode.contains(anchorNode) &&
      notebookNode.contains(focusNode)
    ) {
      this.update();
    }
  };

  constructor(tracker?: INotebookTracker) {
    super();
    this.id = 'selenejs-chat-sidebar';
    this.addClass('jp-selenepy-chat');
    this.title.label = 'Chat';
    this.title.caption = 'Selenejs Chat';
    this.title.iconClass = 'jp-CodeConsoleIcon';
    if (tracker) {
      this._tracker = tracker;
      tracker.currentChanged.connect((_, panel) => {
        if (panel) {
          panel.content.activeCellChanged.connect(() => this.update(), this);
        }
        this.update();
      }, this);
      if (tracker.currentWidget) {
        tracker.currentWidget.content.activeCellChanged.connect(
          () => this.update(),
          this
        );
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'selectionchange',
        this._onDocumentSelectionChange
      );
    }
    void this._loadThreads();
  }

  dispose(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'selectionchange',
        this._onDocumentSelectionChange
      );
    }
    super.dispose();
  }

  public setChatMenu(menu: Menu) {
    this._chatMenu = menu;
    this._updateMenu();
  }

  private _updateMenu() {
    if (!this._chatMenu) {
      return;
    }

    const contextMenuPrompts = this._prompts.filter(
      (p: IPrompt) => p.category === 'context_menu' || p.category === 'chat'
    );

    const nextFingerprint = contextMenuPrompts
      .map(
        p =>
          `${p.id}:${p.name}:${p.description ?? ''}:${p.content}:${p.category ?? ''}`
      )
      .join('|');

    if (nextFingerprint === this._menuFingerprint) {
      return;
    }

    this._menuFingerprint = nextFingerprint;
    this._chatMenu.clearItems();

    for (const p of contextMenuPrompts) {
      this._chatMenu.addItem({
        command: CommandIDs.chatAboutThis,
        args: {
          promptName: p.name,
          promptDescription: p.description || '',
          promptContent: p.content
        }
      });
    }
  }

  public get prompts(): IPrompt[] {
    return this._prompts;
  }

  // ------------------------------------------------------------------
  // Thread management
  // ------------------------------------------------------------------

  private async _loadThreads(): Promise<void> {
    try {
      this._threads = await fetchThreads();
      this._threadsLoaded = true;
      // Auto-select the most recent thread if none is active
      if (!this._activeThreadId && this._threads.length > 0) {
        await this._selectThread(this._threads[0].id);
      } else {
        this.update();
      }
    } catch (err) {
      console.error('Failed to load chat threads', err);
      this._threadsLoaded = true;
      this.update();
    }
  }

  private async _refreshThreads(): Promise<void> {
    try {
      this._threads = await fetchThreads();
      this._threadsLoaded = true;
      if (
        this._activeThreadId &&
        !this._threads.some(t => t.id === this._activeThreadId)
      ) {
        this._activeThreadId =
          this._threads.length > 0 ? this._threads[0].id : null;
      }
      this.update();
    } catch (err) {
      console.error('Failed to refresh chat threads', err);
    }
  }

  private async _selectThread(threadId: string): Promise<void> {
    if (this._isStreaming) {
      return;
    }
    this._activeThreadId = threadId;
    this._messages = [];
    this.update();
    try {
      this._messages = await fetchThreadMessages(threadId);
    } catch (err) {
      console.error('Failed to load thread messages', err);
    }
    this.update();
  }

  public async createNewThread(): Promise<void> {
    if (this._isStreaming) {
      return;
    }
    try {
      const thread = await createThread();
      this._threads = [thread, ...this._threads];
      this._activeThreadId = thread.id;
      this._messages = [];
      this.update();
    } catch (err) {
      console.error('Failed to create thread', err);
    }
  }

  public async deleteActiveThread(): Promise<void> {
    if (!this._activeThreadId || this._isStreaming) {
      return;
    }
    const idToDelete = this._activeThreadId;
    try {
      await deleteThread(idToDelete);
      this._threads = this._threads.filter(t => t.id !== idToDelete);
      this._messages = [];
      this._activeThreadId =
        this._threads.length > 0 ? this._threads[0].id : null;
      if (this._activeThreadId) {
        await this._selectThread(this._activeThreadId);
      } else {
        this.update();
      }
    } catch (err) {
      console.error('Failed to delete thread', err);
    }
  }

  setSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    this.update();
  }

  private _getActiveCellContext(): {
    cellNumber: number;
    excerpt?: string;
  } | null {
    const widget = this._tracker?.currentWidget;
    if (!widget) {
      return null;
    }
    const cellNumber = (widget.content.activeCellIndex ?? 0) + 1;
    const snapshot = this._getSnapshot();
    const rawSelected = snapshot?.activeCellContext?.selectedText;
    if (!rawSelected) {
      return { cellNumber };
    }
    const flat = rawSelected.replace(/\n/g, ' ').trim();
    const excerpt = flat.length > 80 ? `${flat.slice(0, 80)}\u2026` : flat;
    return { cellNumber, excerpt };
  }

  private _getSnapshot(): INotebookSnapshot | null {
    if (!this._tracker || !this._tracker.currentWidget) {
      return null;
    }
    const maxChars = this._settings?.maxCellCharacters ?? 10000;
    return buildSnapshot(this._tracker.currentWidget, maxChars);
  }

  private _buildContextMenuMessage(promptText: string): string {
    const snapshot = this._getSnapshot();
    const selectedText = snapshot?.activeCellContext?.selectedText?.trim();

    if (!selectedText) {
      return promptText;
    }

    return [
      'Focus primarily on the selected notebook content below.',
      '',
      'Selected notebook content:',
      '"""',
      selectedText,
      '"""',
      '',
      'Instruction:',
      promptText
    ].join('\n');
  }

  public async executePrompt(promptText: string) {
    this._view = 'chat';
    await this._handleSendMessage(promptText);
  }

  public async executeContextMenuPrompt(promptText: string) {
    this._view = 'chat';
    await this._handleSendMessage(this._buildContextMenuMessage(promptText));
  }

  private async _handleSendMessage(content: string) {
    const userMsgTimestamp = Date.now() / 1000;
    const userMsgId = Date.now().toString();
    this._messages.push({
      id: userMsgId,
      role: 'user',
      content,
      timestamp: userMsgTimestamp
    });

    const agentMsgId = (Date.now() + 1).toString();
    this._messages.push({
      id: agentMsgId,
      role: 'ai',
      content: '',
      timestamp: Date.now() / 1000
    });

    this._isStreaming = true;
    this.update();

    this._abortController = new AbortController();

    try {
      const stream = streamChat(
        content,
        this._getSnapshot(),
        this._settings,
        this._abortController.signal,
        this._activeThreadId ?? undefined
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
      if (this._activeThreadId) {
        void this._refreshThreads();
      }
      this.update();
    }
  }

  private _handleClear() {
    if (this._abortController) {
      this._abortController.abort();
    }
    this._messages = [];
    this._isStreaming = false;
    // If there's an active thread, reload its messages from the DB
    if (this._activeThreadId) {
      void this._selectThread(this._activeThreadId);
    } else {
      this.update();
    }
  }

  private _markStoppedOnLastAssistantMessage() {
    const aiMsg = this._messages[this._messages.length - 1];
    if (!aiMsg || aiMsg.role !== 'ai') {
      return;
    }

    const marker = '[Stopped]';
    const trimmed = aiMsg.content.trim();
    if (trimmed.endsWith(marker)) {
      return;
    }

    this._messages[this._messages.length - 1] = {
      ...aiMsg,
      content: trimmed ? `${trimmed}\n${marker}` : marker
    };
  }

  private _handleStop() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._markStoppedOnLastAssistantMessage();
    this._isStreaming = false;
    this.update();
  }

  protected render(): JSX.Element {
    const cellContext = this._getActiveCellContext();
    return (
      <ChatSidebarContent
        view={this._view}
        messages={this._messages}
        isStreaming={this._isStreaming}
        settings={this._settings}
        selectedSnippetId={this._selectedSnippetId}
        selectedContextMenuId={this._selectedContextMenuId}
        threads={this._threads}
        activeThreadId={this._activeThreadId}
        threadsLoaded={this._threadsLoaded}
        onViewChange={v => {
          this._view = v;
          this.update();
        }}
        onSendMessage={msg => void this._handleSendMessage(msg)}
        onClear={() => this._handleClear()}
        onStop={() => this._handleStop()}
        onSelectSnippet={id => {
          this._selectedSnippetId = id;
          this.update();
        }}
        onSelectContextMenu={id => {
          this._selectedContextMenuId = id;
          this.update();
        }}
        onPromptsChanged={prompts => {
          this._prompts = prompts;
          this._updateMenu();
        }}
        onSelectThread={id => void this._selectThread(id)}
        onCreateThread={() => void this.createNewThread()}
        onDeleteThread={() => void this.deleteActiveThread()}
        cellContext={cellContext}
      />
    );
  }
}


