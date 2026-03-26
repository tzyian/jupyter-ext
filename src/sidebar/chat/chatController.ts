import { IDisposable } from '@lumino/disposable';
import { Signal, ISignal } from '@lumino/signaling';
import { INotebookTracker } from '@jupyterlab/notebook';
import { InputDialog } from '@jupyterlab/apputils';
import {
  streamChat,
  fetchThreads,
  createThread,
  deleteThread,
  renameThread,
  updateThread,
  fetchThreadMessages
} from '../api';
import { IChatState, ChatStreamEvent } from './types';
import { IPrompt, ISuggestedEditsSettings, INotebookSnapshot } from '../types';
import { buildSnapshot } from '../utils/snapshot';
import { CHAT_VIEW_CHAT, ChatSidebarView } from './constants';

export interface IChatController extends IDisposable {
  readonly state: IChatState;
  readonly messageSent: ISignal<IChatController, { isContextMenu: boolean }>;
  readonly chatCleared: ISignal<IChatController, void>;
  readonly chatStopped: ISignal<IChatController, void>;
  readonly metricsReceived: ISignal<
    IChatController,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  >;
  readonly threadCreated: ISignal<IChatController, { threadId: string }>;
  readonly threadDeleted: ISignal<IChatController, { threadId: string }>;

  executePrompt(promptText: string): Promise<void>;
  executeContextMenuPrompt(promptText: string): Promise<void>;
  handleSendMessage(content: string, isContextMenu?: boolean): Promise<void>;
  handleClear(): void;
  handleStop(): void;
  handleSelectThread(threadId: string): Promise<void>;
  handleCreateThread(): Promise<void>;
  handleDeleteActiveThread(): Promise<void>;
  handleRenameActiveThread(): Promise<void>;
  handleViewChange(view: ChatSidebarView): void;
  handleSelectSnippet(id: string): void;
  handleSelectSystemPrompt(id: string): void;
  handlePromptsChanged(prompts: IPrompt[]): void;
  handleUpdateResponseDuration(duration: number): Promise<void>;
  setSettings(settings: ISuggestedEditsSettings): void;
  openPromptManager(view: any): void;
}

export interface IChatSidebar {
  setState(state: IChatState): void;
  update(): void;
}

export class ChatController implements IChatController {
  private _state: IChatState;
  private _tracker: INotebookTracker | null;
  private _abortController: AbortController | null = null;
  private _settings: ISuggestedEditsSettings | null = null;
  private _disposed = false;

  private readonly _messageSent = new Signal<
    IChatController,
    { isContextMenu: boolean }
  >(this);
  private readonly _chatCleared = new Signal<IChatController, void>(this);
  private readonly _chatStopped = new Signal<IChatController, void>(this);
  private readonly _metricsReceived = new Signal<
    IChatController,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  >(this);
  private readonly _threadCreated = new Signal<
    IChatController,
    { threadId: string }
  >(this);
  private readonly _threadDeleted = new Signal<
    IChatController,
    { threadId: string }
  >(this);

  constructor(
    private readonly _sidebar: IChatSidebar,
    tracker?: INotebookTracker
  ) {
    this._tracker = tracker || null;
    this._state = {
      messages: [],
      threads: [],
      activeThreadId: null,
      threadsLoaded: false,
      isStreaming: false,
      view: CHAT_VIEW_CHAT,
      selectedSnippetId: '__CREATE_NEW__',
      selectedSystemPromptId: 'default_chat_system',
      prompts: [],
      cellContext: null,
      settings: null
    };

    if (this._tracker) {
      this._tracker.currentChanged.connect(this._onNotebookChanged, this);
      if (this._tracker.currentWidget) {
        this._tracker.currentWidget.content.activeCellChanged.connect(
          this._onActiveCellChanged,
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

  get state(): IChatState {
    return this._state;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  get messageSent(): ISignal<IChatController, { isContextMenu: boolean }> {
    return this._messageSent;
  }
  get chatCleared(): ISignal<IChatController, void> {
    return this._chatCleared;
  }
  get chatStopped(): ISignal<IChatController, void> {
    return this._chatStopped;
  }
  get metricsReceived(): ISignal<
    IChatController,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  > {
    return this._metricsReceived;
  }
  get threadCreated(): ISignal<IChatController, { threadId: string }> {
    return this._threadCreated;
  }
  get threadDeleted(): ISignal<IChatController, { threadId: string }> {
    return this._threadDeleted;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'selectionchange',
        this._onDocumentSelectionChange
      );
    }
    if (this._tracker) {
      this._tracker.currentChanged.disconnect(this._onNotebookChanged, this);
    }
    Signal.clearData(this);
  }

  private _updateState(partial: Partial<IChatState>): void {
    this._state = { ...this._state, ...partial };
    this._sidebar.setState(this._state);
  }

  private _onNotebookChanged(): void {
    this._updateCellContext();
    this._sidebar.update(); // Trigger re-render if needed
  }

  private _onActiveCellChanged(): void {
    this._updateCellContext();
    this._sidebar.update();
  }

  private _onDocumentSelectionChange = (): void => {
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
      this._updateCellContext();
      this._sidebar.update();
    }
  };

  private _updateCellContext(): void {
    const widget = this._tracker?.currentWidget;
    if (!widget) {
      this._updateState({ cellContext: null });
      return;
    }
    const cellNumber = (widget.content.activeCellIndex ?? 0) + 1;
    const snapshot = this._getSnapshot();
    const rawSelected = snapshot?.activeCellContext?.selectedText;
    if (!rawSelected) {
      this._updateState({ cellContext: { cellNumber } });
      return;
    }
    const flat = rawSelected.replace(/\n/g, ' ').trim();
    const excerpt = flat.length > 80 ? `${flat.slice(0, 80)}\u2026` : flat;
    this._updateState({ cellContext: { cellNumber, excerpt } });
  }

  private _getSnapshot(): INotebookSnapshot | null {
    if (!this._tracker || !this._tracker.currentWidget) {
      return null;
    }
    const maxChars = this._settings?.maxCellCharacters ?? 10000;
    return buildSnapshot(this._tracker.currentWidget, maxChars);
  }

  private async _loadThreads(): Promise<void> {
    try {
      const threads = await fetchThreads();
      this._updateState({ threads, threadsLoaded: true });
      if (!this._state.activeThreadId && threads.length > 0) {
        await this.handleSelectThread(threads[0].id);
      }
    } catch (err) {
      console.error('Failed to load chat threads', err);
      this._updateState({ threadsLoaded: true });
    }
  }

  private async _refreshThreads(): Promise<void> {
    try {
      const threads = await fetchThreads();
      let activeThreadId = this._state.activeThreadId;
      if (activeThreadId && !threads.some(t => t.id === activeThreadId)) {
        activeThreadId = threads.length > 0 ? threads[0].id : null;
      }
      this._updateState({ threads, activeThreadId, threadsLoaded: true });
    } catch (err) {
      console.error('Failed to refresh chat threads', err);
    }
  }

  async handleSelectThread(threadId: string): Promise<void> {
    if (this._state.isStreaming) {
      return;
    }
    this._updateState({ activeThreadId: threadId, messages: [] });
    try {
      const messages = await fetchThreadMessages(threadId);
      this._updateState({ messages });
    } catch (err) {
      console.error('Failed to load thread messages', err);
    }
  }

  async handleCreateThread(): Promise<void> {
    if (this._state.isStreaming) {
      return;
    }
    try {
      const thread = await createThread();
      this._updateState({
        threads: [thread, ...this._state.threads],
        activeThreadId: thread.id,
        messages: []
      });
      this._threadCreated.emit({ threadId: thread.id });
    } catch (err) {
      console.error('Failed to create thread', err);
    }
  }

  async handleDeleteActiveThread(): Promise<void> {
    if (!this._state.activeThreadId || this._state.isStreaming) {
      return;
    }
    const idToDelete = this._state.activeThreadId;
    try {
      await deleteThread(idToDelete);
      const threads = this._state.threads.filter(t => t.id !== idToDelete);
      this._threadDeleted.emit({ threadId: idToDelete });
      const activeThreadId = threads.length > 0 ? threads[0].id : null;
      this._updateState({ threads, activeThreadId, messages: [] });
      if (activeThreadId) {
        await this.handleSelectThread(activeThreadId);
      }
    } catch (err) {
      console.error('Failed to delete thread', err);
    }
  }

  async handleRenameActiveThread(): Promise<void> {
    if (!this._state.activeThreadId || this._state.isStreaming) {
      return;
    }
    const currentThread = this._state.threads.find(
      t => t.id === this._state.activeThreadId
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
        await renameThread(this._state.activeThreadId, newTitle);
        const threads = this._state.threads.map(t =>
          t.id === this._state.activeThreadId ? { ...t, title: newTitle } : t
        );
        this._updateState({ threads });
      } catch (err) {
        console.error('Failed to rename thread', err);
      }
    }
  }

  setSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    this._updateState({ settings });
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

  async executePrompt(promptText: string): Promise<void> {
    this._updateState({ view: CHAT_VIEW_CHAT });
    await this.handleSendMessage(promptText);
  }

  async executeContextMenuPrompt(promptText: string): Promise<void> {
    this._updateState({ view: CHAT_VIEW_CHAT });
    await this.handleSendMessage(
      this._buildContextMenuMessage(promptText),
      true
    );
  }

  async handleSendMessage(
    content: string,
    isContextMenu = false
  ): Promise<void> {
    this._messageSent.emit({ isContextMenu });
    const userMsgTimestamp = Date.now() / 1000;
    const userMsgId = Date.now().toString();
    const messages = [...this._state.messages];
    messages.push({
      id: userMsgId,
      role: 'user',
      content,
      timestamp: userMsgTimestamp
    });

    const agentMsgId = (Date.now() + 1).toString();
    messages.push({
      id: agentMsgId,
      role: 'ai',
      content: '',
      timestamp: Date.now() / 1000
    });

    this._updateState({ messages, isStreaming: true });
    this._abortController = new AbortController();

    try {
      const systemPromptId = this._state.selectedSystemPromptId;
      const promptObj = this._state.prompts.find(p => p.id === systemPromptId);
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
        this._state.activeThreadId ?? undefined
      );

      for await (const event of stream) {
        this._processStreamEvent(event as ChatStreamEvent);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to stream chat:', err);
        const msgs = [...this._state.messages];
        const aiMsg = msgs[msgs.length - 1];
        if (aiMsg && aiMsg.role === 'ai') {
          msgs[msgs.length - 1] = {
            ...aiMsg,
            content: aiMsg.content + `\n[Stream Error: ${err.message}]`
          };
          this._updateState({ messages: msgs });
        }
      }
    } finally {
      this._updateState({ isStreaming: false });
      this._abortController = null;
      if (this._state.activeThreadId) {
        void this._refreshThreads();
      }
    }
  }

  private _processStreamEvent(event: ChatStreamEvent): void {
    const messages = [...this._state.messages];
    const aiMsg = messages[messages.length - 1];
    if (!aiMsg || aiMsg.role !== 'ai') {
      return;
    }

    switch (event.type) {
      case 'chunk':
        messages[messages.length - 1] = {
          ...aiMsg,
          content: aiMsg.content + event.content
        };
        this._updateState({ messages });
        break;
      case 'intermediate_chunk': {
        const thoughts = aiMsg.thoughts ? [...aiMsg.thoughts] : [];
        const agentId = event.agent;
        const lastThought =
          thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;
        if (lastThought && lastThought.agent === agentId) {
          thoughts[thoughts.length - 1] = {
            ...lastThought,
            content: lastThought.content + event.content
          };
        } else {
          thoughts.push({ agent: agentId, content: event.content });
        }
        messages[messages.length - 1] = { ...aiMsg, thoughts };
        this._updateState({ messages });
        break;
      }
      case 'tool_call': {
        const toolCalls = aiMsg.toolCalls ? [...aiMsg.toolCalls] : [];
        toolCalls.push({
          name: event.name,
          input: event.input,
          status: 'active'
        });
        messages[messages.length - 1] = { ...aiMsg, toolCalls };
        this._updateState({ messages });
        break;
      }
      case 'tool_result': {
        const toolCalls = aiMsg.toolCalls ? [...aiMsg.toolCalls] : [];
        for (let i = toolCalls.length - 1; i >= 0; i--) {
          if (
            toolCalls[i].name === event.name &&
            toolCalls[i].status === 'active'
          ) {
            toolCalls[i] = { ...toolCalls[i], status: 'done' };
            break;
          }
        }
        messages[messages.length - 1] = { ...aiMsg, toolCalls };
        this._updateState({ messages });
        break;
      }
      case 'error':
        console.error('Chat error:', event.message);
        messages[messages.length - 1] = {
          ...aiMsg,
          content: aiMsg.content + `\n[Error: ${event.message}]`
        };
        this._updateState({ messages });
        break;
      case 'metrics':
        this._metricsReceived.emit(event);
        break;
    }
  }

  handleClear(): void {
    if (this._abortController) {
      this._abortController.abort();
    }
    this._chatCleared.emit(void 0);
    this._updateState({ messages: [], isStreaming: false });
    if (this._state.activeThreadId) {
      void this.handleSelectThread(this._state.activeThreadId);
    }
  }

  handleStop(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._chatStopped.emit(void 0);
    this._markStoppedOnLastAssistantMessage();
    this._updateState({ isStreaming: false });
  }

  private _markStoppedOnLastAssistantMessage(): void {
    const messages = [...this._state.messages];
    const aiMsg = messages[messages.length - 1];
    if (!aiMsg || aiMsg.role !== 'ai') {
      return;
    }

    const marker = '[Stopped]';
    const trimmed = aiMsg.content.trim();
    if (trimmed.endsWith(marker)) {
      return;
    }

    messages[messages.length - 1] = {
      ...aiMsg,
      content: trimmed ? `${trimmed}\n${marker}` : marker
    };
    this._updateState({ messages });
  }

  handleViewChange(view: ChatSidebarView): void {
    this._updateState({ view });
  }

  handleSelectSnippet(id: string): void {
    this._updateState({ selectedSnippetId: id });
  }

  handleSelectSystemPrompt(id: string): void {
    this._updateState({ selectedSystemPromptId: id });
  }

  handlePromptsChanged(prompts: IPrompt[]): void {
    this._updateState({ prompts });
    const hasSelectedSystemPrompt = prompts.some(
      p => p.id === this._state.selectedSystemPromptId
    );
    if (!hasSelectedSystemPrompt) {
      this._updateState({ selectedSystemPromptId: 'default_chat_system' });
    }
  }

  async handleUpdateResponseDuration(duration: number): Promise<void> {
    if (this._state.activeThreadId) {
      try {
        await updateThread(this._state.activeThreadId, {
          lastResponseDuration: duration
        });
        const threads = this._state.threads.map(t =>
          t.id === this._state.activeThreadId
            ? { ...t, lastResponseDuration: duration }
            : t
        );
        this._updateState({ threads });
      } catch (err) {
        console.error('Failed to update response duration', err);
      }
    }
  }

  openPromptManager(view: any): void {
    this._updateState({ view });
  }
}
