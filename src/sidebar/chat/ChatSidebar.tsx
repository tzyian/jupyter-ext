import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';
import type { IChatSidebarSignals, IChatState } from './types';
import { ChatSidebarContent } from './components/ChatSidebarContent';
import { CHAT_SIDEBAR_ID } from '../../types';
import { IChatController } from './chatController';

export class ChatSidebar extends ReactWidget {
  private _state: IChatState | null = null;
  private _controller: IChatController | null = null;

  constructor() {
    super();
    this.id = CHAT_SIDEBAR_ID;
    this.addClass('jp-selenepy-chat');
    this.title.label = 'Chat';
    this.title.caption = 'Selenejs Chat';
    this.title.iconClass = 'jp-CodeConsoleIcon';
  }

  setController(controller: IChatController): void {
    this._controller = controller;
  }

  setState(state: IChatState): void {
    this._state = state;
    this.update();
  }

  get messageSent(): ISignal<IChatSidebarSignals, { isContextMenu: boolean }> {
    return this._messageSent;
  }
  get chatCleared(): ISignal<IChatSidebarSignals, void> {
    return this._chatCleared;
  }
  get chatStopped(): ISignal<IChatSidebarSignals, void> {
    return this._chatStopped;
  }
  get metricsReceived(): ISignal<
    IChatSidebarSignals,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  > {
    return this._metricsReceived;
  }
  get threadCreated(): ISignal<IChatSidebarSignals, { threadId: string }> {
    return this._threadCreated;
  }
  get threadDeleted(): ISignal<IChatSidebarSignals, { threadId: string }> {
    return this._threadDeleted;
  }

  private readonly _messageSent = new Signal<
    IChatSidebarSignals,
    { isContextMenu: boolean }
  >(this);
  private readonly _chatCleared = new Signal<IChatSidebarSignals, void>(this);
  private readonly _chatStopped = new Signal<IChatSidebarSignals, void>(this);
  private readonly _metricsReceived = new Signal<
    IChatSidebarSignals,
    { tokensUsed: number; tokensSent: number; messagesSent: number }
  >(this);
  private readonly _threadCreated = new Signal<
    IChatSidebarSignals,
    { threadId: string }
  >(this);
  private readonly _threadDeleted = new Signal<
    IChatSidebarSignals,
    { threadId: string }
  >(this);

  protected render(): JSX.Element {
    if (!this._state || !this._controller) {
      return <div className="jp-selenepy-loading">Loading chat...</div>;
    }

    const controller = this._controller;

    return (
      <ChatSidebarContent
        {...this._state}
        onViewChange={v => controller.handleViewChange(v)}
        onSendMessage={msg => void controller.handleSendMessage(msg)}
        onClear={() => controller.handleClear()}
        onStop={() => controller.handleStop()}
        onSelectSnippet={id => controller.handleSelectSnippet(id)}
        onSelectSystemPrompt={id => controller.handleSelectSystemPrompt(id)}
        onPromptsChanged={prompts => controller.handlePromptsChanged(prompts)}
        onSelectThread={id => void controller.handleSelectThread(id)}
        onCreateThread={() => void controller.handleCreateThread()}
        onDeleteThread={() => void controller.handleDeleteActiveThread()}
        onRenameThread={() => void controller.handleRenameActiveThread()}
        onUpdateResponseDuration={d =>
          void controller.handleUpdateResponseDuration(d)
        }
      />
    );
  }
}
