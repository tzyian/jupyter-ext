import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import { ChatSidebarContent } from './components/ChatSidebarContent';
import { CHAT_SIDEBAR_ID } from '../../types';
import { IChatController } from './chatController';

export class ChatSidebar extends ReactWidget {
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
    this.update();
  }

  protected render(): JSX.Element {
    if (!this._controller) {
      return <div className="jp-selenepy-loading">Loading chat...</div>;
    }

    return <ChatSidebarContent controller={this._controller} />;
  }
}
