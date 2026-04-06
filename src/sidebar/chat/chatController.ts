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
import { useChatStore } from './useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';

export interface IChatController extends IDisposable {
  readonly state: IChatState;
  readonly messageSent: ISignal<IChatController, { isContextMenu: boolean }>;
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

export class ChatController implements IChatController {
  private _tracker: INotebookTracker | null;
  private _abortController: AbortController | null = null;
  private _disposed = false;

  private readonly _messageSent = new Signal<
    IChatController,
    { isContextMenu: boolean }
  >(this);
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

  constructor(tracker?: INotebookTracker) {
    this._tracker = tracker || null;

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
    return useChatStore.getState();
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  get messageSent(): ISignal<IChatController, { isContextMenu: boolean }> {
    return this._messageSent;
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

  private _onNotebookChanged(): void {
    this._updateCellContext();
  }

  private _onActiveCellChanged(): void {
    this._updateCellContext();
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
    }
  };

  private _updateCellContext(): void {
    const widget = this._tracker?.currentWidget;
    const { setCellContext } = useChatStore.getState();

    if (!widget) {
      setCellContext(null);
      return;
    }
    const cellNumber = (widget.content.activeCellIndex ?? 0) + 1;
    const snapshot = this._getSnapshot();
    const rawSelected = snapshot?.activeCellContext?.selectedText;
    if (!rawSelected) {
      setCellContext({ cellNumber });
      return;
    }
    const flat = rawSelected.replace(/\n/g, ' ').trim();
    const excerpt = flat.length > 80 ? `${flat.slice(0, 80)}\u2026` : flat;
    setCellContext({ cellNumber, excerpt });
  }

  private _getSnapshot(): INotebookSnapshot | null {
    if (!this._tracker || !this._tracker.currentWidget) {
      return null;
    }
    const settings = useSettingsStore.getState().settings;
    const maxChars = settings?.maxCellCharacters ?? 10000;
    return buildSnapshot(this._tracker.currentWidget, maxChars);
  }

  private async _loadThreads(): Promise<void> {
    const { setThreads, setThreadsLoaded } = useChatStore.getState();
    try {
      const threads = await fetchThreads();
      setThreads(threads);
      setThreadsLoaded(true);
      if (!this.state.activeThreadId && threads.length > 0) {
        await this.handleSelectThread(threads[0].id);
      }
    } catch (err) {
      console.error('Failed to load chat threads', err);
      setThreadsLoaded(true);
    }
  }

  private async _refreshThreads(): Promise<void> {
    const { setThreads, setActiveThreadId, setThreadsLoaded } =
      useChatStore.getState();
    try {
      const threads = await fetchThreads();
      let activeThreadId = this.state.activeThreadId;
      if (activeThreadId && !threads.some(t => t.id === activeThreadId)) {
        activeThreadId = threads.length > 0 ? threads[0].id : null;
      }
      setThreads(threads);
      setActiveThreadId(activeThreadId);
      setThreadsLoaded(true);
    } catch (err) {
      console.error('Failed to refresh chat threads', err);
    }
  }

  async handleSelectThread(threadId: string): Promise<void> {
    const { isStreaming, setActiveThreadId, setMessages } =
      useChatStore.getState();
    if (isStreaming) {
      return;
    }
    setActiveThreadId(threadId);
    setMessages([]);
    try {
      const messages = await fetchThreadMessages(threadId);
      setMessages(messages);
    } catch (err) {
      console.error('Failed to load thread messages', err);
    }
  }

  async handleCreateThread(): Promise<void> {
    const { isStreaming, setThreads, setActiveThreadId, setMessages, threads } =
      useChatStore.getState();
    if (isStreaming) {
      return;
    }
    try {
      const thread = await createThread();
      setThreads([thread, ...threads]);
      setActiveThreadId(thread.id);
      setMessages([]);
      this._threadCreated.emit({ threadId: thread.id });
    } catch (err) {
      console.error('Failed to create thread', err);
    }
  }

  async handleDeleteActiveThread(): Promise<void> {
    const {
      activeThreadId,
      isStreaming,
      threads,
      setActiveThreadId,
      setMessages,
      setThreads
    } = useChatStore.getState();
    if (!activeThreadId || isStreaming) {
      return;
    }
    const idToDelete = activeThreadId;
    try {
      await deleteThread(idToDelete);
      const filteredThreads = threads.filter(t => t.id !== idToDelete);
      this._threadDeleted.emit({ threadId: idToDelete });
      const newActiveId =
        filteredThreads.length > 0 ? filteredThreads[0].id : null;
      setThreads(filteredThreads);
      setActiveThreadId(newActiveId);
      setMessages([]);
      if (newActiveId) {
        await this.handleSelectThread(newActiveId);
      }
    } catch (err) {
      console.error('Failed to delete thread', err);
    }
  }

  async handleRenameActiveThread(): Promise<void> {
    const { activeThreadId, isStreaming, threads, setThreads } =
      useChatStore.getState();
    if (!activeThreadId || isStreaming) {
      return;
    }
    const currentThread = threads.find(t => t.id === activeThreadId);
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
        await renameThread(activeThreadId, newTitle);
        const updatedThreads = threads.map(t =>
          t.id === activeThreadId ? { ...t, title: newTitle } : t
        );
        setThreads(updatedThreads);
      } catch (err) {
        console.error('Failed to rename thread', err);
      }
    }
  }

  setSettings(settings: ISuggestedEditsSettings): void {
    // Note: useSettingsStore is now the source of truth for settings,
    // but we keep this for compatibility during migration if needed.
    useSettingsStore.getState().setSettings(settings);
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
    const { setView } = useChatStore.getState();
    setView(CHAT_VIEW_CHAT);
    await this.handleSendMessage(promptText);
  }

  async executeContextMenuPrompt(promptText: string): Promise<void> {
    const { setView } = useChatStore.getState();
    setView(CHAT_VIEW_CHAT);
    await this.handleSendMessage(
      this._buildContextMenuMessage(promptText),
      true
    );
  }

  async handleSendMessage(
    content: string,
    isContextMenu = false
  ): Promise<void> {
    const {
      messages,
      setStreaming,
      setMessages,
      selectedSystemPromptId,
      prompts,
      activeThreadId
    } = useChatStore.getState();
    const settings = useSettingsStore.getState().settings;

    this._messageSent.emit({ isContextMenu });
    const userMsgTimestamp = Date.now() / 1000;
    const userMsgId = Date.now().toString();
    const newMessages = [...messages];
    newMessages.push({
      id: userMsgId,
      role: 'user',
      content,
      timestamp: userMsgTimestamp
    });

    const agentMsgId = (Date.now() + 1).toString();
    newMessages.push({
      id: agentMsgId,
      role: 'ai',
      content: '',
      timestamp: Date.now() / 1000
    });

    setMessages(newMessages);
    setStreaming(true);
    this._abortController = new AbortController();

    try {
      const promptObj = prompts.find(p => p.id === selectedSystemPromptId);
      const systemPromptContent = promptObj
        ? promptObj.content
        : 'You are a helpful coding assistant.';
      const settingsWithResolvedPrompt = {
        ...(settings || {}),
        chatSystemPrompt: systemPromptContent
      } as ISuggestedEditsSettings;

      const stream = streamChat(
        content,
        this._getSnapshot(),
        settingsWithResolvedPrompt,
        this._abortController.signal,
        activeThreadId ?? undefined
      );

      for await (const event of stream) {
        this._processStreamEvent(event as ChatStreamEvent);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to stream chat:', err);
        const msgs = [...useChatStore.getState().messages];
        const aiMsg = msgs[msgs.length - 1];
        if (aiMsg && aiMsg.role === 'ai') {
          msgs[msgs.length - 1] = {
            ...aiMsg,
            content: aiMsg.content + `\n[Stream Error: ${err.message}]`
          };
          setMessages(msgs);
        }
      }
    } finally {
      setStreaming(false);
      this._abortController = null;
      if (useChatStore.getState().activeThreadId) {
        void this._refreshThreads();
      }
    }
  }

  private _processStreamEvent(event: ChatStreamEvent): void {
    const { messages, updateLastMessage } = useChatStore.getState();
    const aiMsg = messages[messages.length - 1];
    if (!aiMsg || aiMsg.role !== 'ai') {
      return;
    }

    switch (event.type) {
      case 'chunk':
        updateLastMessage({
          content: aiMsg.content + event.content
        });
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
        updateLastMessage({ thoughts });
        break;
      }
      case 'tool_call': {
        const toolCalls = aiMsg.toolCalls ? [...aiMsg.toolCalls] : [];
        toolCalls.push({
          name: event.name,
          input: event.input,
          status: 'active'
        });
        updateLastMessage({ toolCalls });
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
        updateLastMessage({ toolCalls });
        break;
      }
      case 'error':
        console.error('Chat error:', event.message);
        updateLastMessage({
          content: aiMsg.content + `\n[Error: ${event.message}]`
        });
        break;
      case 'metrics':
        this._metricsReceived.emit(event);
        break;
    }
  }

  handleStop(): void {
    const { setStreaming } = useChatStore.getState();
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._chatStopped.emit(void 0);
    this._markStoppedOnLastAssistantMessage();
    setStreaming(false);
  }

  private _markStoppedOnLastAssistantMessage(): void {
    const { messages, updateLastMessage } = useChatStore.getState();
    const aiMsg = messages[messages.length - 1];
    if (!aiMsg || aiMsg.role !== 'ai') {
      return;
    }

    const marker = '[Stopped]';
    const trimmed = aiMsg.content.trim();
    if (trimmed.endsWith(marker)) {
      return;
    }

    updateLastMessage({
      content: trimmed ? `${trimmed}\n${marker}` : marker
    });
  }

  handleViewChange(view: ChatSidebarView): void {
    useChatStore.getState().setView(view);
  }

  handleSelectSnippet(id: string): void {
    useChatStore.getState().setSelectedSnippetId(id);
  }

  handleSelectSystemPrompt(id: string): void {
    useChatStore.getState().setSelectedSystemPromptId(id);
  }

  handlePromptsChanged(prompts: IPrompt[]): void {
    const { setPrompts, selectedSystemPromptId, setSelectedSystemPromptId } =
      useChatStore.getState();
    setPrompts(prompts);
    const hasSelectedSystemPrompt = prompts.some(
      p => p.id === selectedSystemPromptId
    );
    if (!hasSelectedSystemPrompt) {
      setSelectedSystemPromptId('default_chat_system');
    }
  }

  async handleUpdateResponseDuration(duration: number): Promise<void> {
    const { activeThreadId, threads, setThreads } = useChatStore.getState();
    if (activeThreadId) {
      try {
        await updateThread(activeThreadId, {
          lastResponseDuration: duration
        });
        const updatedThreads = threads.map(t =>
          t.id === activeThreadId ? { ...t, lastResponseDuration: duration } : t
        );
        setThreads(updatedThreads);
      } catch (err) {
        console.error('Failed to update response duration', err);
      }
    }
  }

  openPromptManager(view: any): void {
    useChatStore.getState().setView(view);
  }
}
