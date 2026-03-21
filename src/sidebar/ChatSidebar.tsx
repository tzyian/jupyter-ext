import { ReactWidget, InputDialog } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';
import {
  streamChat,
  fetchThreads,
  createThread,
  deleteThread,
  renameThread,
  updateThread,
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

import { buildSnapshot } from './utils/snapshot';
import { ChatSidebarContent } from './components/ChatSidebarContent';

export class ChatSidebar extends ReactWidget {
  private readonly _messageSent = new Signal<
    ChatSidebar,
    { isContextMenu: boolean }
  >(this);
  private readonly _chatCleared = new Signal<ChatSidebar, void>(this);
  private readonly _chatStopped = new Signal<ChatSidebar, void>(this);
  private readonly _metricsReceived = new Signal<
    ChatSidebar,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  >(this);
  private readonly _threadCreated = new Signal<
    ChatSidebar,
    { threadId: string }
  >(this);
  private readonly _threadDeleted = new Signal<
    ChatSidebar,
    { threadId: string }
  >(this);

  get messageSent(): ISignal<ChatSidebar, { isContextMenu: boolean }> {
    return this._messageSent;
  }
  get chatCleared(): ISignal<ChatSidebar, void> {
    return this._chatCleared;
  }
  get chatStopped(): ISignal<ChatSidebar, void> {
    return this._chatStopped;
  }
  get metricsReceived(): ISignal<
    ChatSidebar,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  > {
    return this._metricsReceived;
  }
  get threadCreated(): ISignal<ChatSidebar, { threadId: string }> {
    return this._threadCreated;
  }
  get threadDeleted(): ISignal<ChatSidebar, { threadId: string }> {
    return this._threadDeleted;
  }

  private _messages: IChatMessage[] = [];
  private _threads: IChatThread[] = [];
  private _activeThreadId: string | null = null;
  private _threadsLoaded = false;
  private _isStreaming = false;
  private _tracker: INotebookTracker | null = null;
  private _abortController: AbortController | null = null;
  private _settings: ISuggestedEditsSettings | null = null;
  private _view: 'chat' | 'chat_snippet' | 'settings' | 'chat_system_prompt' = 'chat';

  private _prompts: IPrompt[] = [];
  private _selectedSnippetId: string = '__CREATE_NEW__';
  private _selectedSystemPromptId: string = 'default_chat_system';
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
      this._threadCreated.emit({ threadId: thread.id });
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
      this._threadDeleted.emit({ threadId: idToDelete });
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

  public async renameActiveThread(): Promise<void> {
    if (!this._activeThreadId || this._isStreaming) {
      return;
    }
    const currentThread = this._threads.find(
      t => t.id === this._activeThreadId
    );
    if (!currentThread) {
      return;
    }

    const result = await InputDialog.getText({
      title: 'Rename Thread',
      text: currentThread.title
    });

    if (
      result.button.accept &&
      result.value &&
      result.value.trim() !== currentThread.title
    ) {
      const newTitle = result.value.trim();
      try {
        await renameThread(this._activeThreadId, newTitle);
        this._threads = this._threads.map(t =>
          t.id === this._activeThreadId ? { ...t, title: newTitle } : t
        );
        this.update();
      } catch (err) {
        console.error('Failed to rename thread', err);
      }
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
    await this._handleSendMessage(
      this._buildContextMenuMessage(promptText),
      true
    );
  }

  private async _handleSendMessage(content: string, isContextMenu = false) {
    this._messageSent.emit({ isContextMenu });
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
      // Resolve the system prompt content from its ID before passing to the backend
      const systemPromptId = this._selectedSystemPromptId;
      const promptObj = this._prompts.find(p => p.id === systemPromptId);
      const systemPromptContent = promptObj
        ? promptObj.content
        : 'You are a helpful coding assistant.';
      const settingsWithResolvedPrompt = {
        ...(this._settings || {}),
        chatSystemPrompt: systemPromptContent
      } as ISuggestedEditsSettings;

      const stream = streamChat(
        content,
        this._getSnapshot(),
        settingsWithResolvedPrompt,
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
        } else if (event.type === 'metrics') {
          this._metricsReceived.emit(event);
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
    this._chatCleared.emit(void 0);
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
    this._chatStopped.emit(void 0);
    this._markStoppedOnLastAssistantMessage();
    this._isStreaming = false;
    this.update();
  }

  public openPromptManager(view: 'chat_snippet' | 'chat_system_prompt') {
    this._view = view;
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
        onSelectSystemPrompt={id => {
          this._selectedSystemPromptId = id;
          this.update();
        }}
        onPromptsChanged={prompts => {
          this._prompts = prompts;
          const hasSelectedSystemPrompt = prompts.some(
            p => p.id === this._selectedSystemPromptId
          );
          if (!hasSelectedSystemPrompt) {
            this._selectedSystemPromptId = 'default_chat_system';
          }
        }}
        onSelectThread={id => void this._selectThread(id)}
        onCreateThread={() => void this.createNewThread()}
        onDeleteThread={() => void this.deleteActiveThread()}
        onRenameThread={() => void this.renameActiveThread()}
        cellContext={cellContext}
        selectedSystemPromptId={this._selectedSystemPromptId}
        lastResponseDuration={
          this._threads.find(t => t.id === this._activeThreadId)
            ?.lastResponseDuration
        }
        onUpdateResponseDuration={(duration: number) => {
          if (this._activeThreadId) {
            void updateThread(this._activeThreadId, {
              lastResponseDuration: duration
            }).then(() => {
              // Update local threads state
              this._threads = this._threads.map(t =>
                t.id === this._activeThreadId
                  ? { ...t, lastResponseDuration: duration }
                  : t
              );
              this.update();
            });
          }
        }}
      />
    );
  }
}
