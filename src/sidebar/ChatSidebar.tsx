import { ReactWidget } from '@jupyterlab/apputils';
import React from 'react';
import { ChatPanel } from './components/ChatPanel';
import { streamChat } from './api';
import type {
  IChatMessage,
  INotebookSnapshot,
  ISuggestedEditsSettings,
  IPrompt
} from '../types';
import type { INotebookTracker } from '@jupyterlab/notebook';
import { Menu } from '@lumino/widgets';
import { buildSnapshot } from './utils/snapshot';
import { fetchPrompts, savePrompt, deletePrompt } from './api';
import { PromptEditorCard } from './components/common/PromptEditorCard';
import { CommandIDs } from './commands';

export class ChatSidebar extends ReactWidget {
  private _messages: IChatMessage[] = [];
  private _isStreaming = false;
  private _tracker: INotebookTracker | null = null;
  private _abortController: AbortController | null = null;
  private _settings: ISuggestedEditsSettings | null = null;
  private _view: 'chat' | 'chat_snippet' | 'context_menu' = 'chat';
  private _prompts: IPrompt[] = [];
  private _chatMenu: Menu | null = null;
  private _selectedSnippetId: string = '__CREATE_NEW__';
  private _selectedContextMenuId: string = '__CREATE_NEW__';

  constructor(tracker?: INotebookTracker) {
    super();
    this.id = 'selenejs-chat-sidebar';
    this.addClass('jp-selenepy-chat');
    this.title.label = 'Chat';
    this.title.caption = 'Selenejs Chat';
    this.title.iconClass = 'jp-CodeConsoleIcon';
    if (tracker) {
      this._tracker = tracker;
    }
    void this.loadPrompts();
  }

  public async loadPrompts() {
    try {
      const allPrompts = await fetchPrompts();
      this._prompts = allPrompts.filter(
        p => p.category === 'chat_snippet' || p.category === 'context_menu' || p.category === 'chat'
      );
      this.update();
      this._updateMenu();
    } catch (e) {
      console.error('Failed to load chat prompts', e);
    }
  }

  public setChatMenu(menu: Menu) {
    this._chatMenu = menu;
    this._updateMenu();
  }

  private _updateMenu() {
    if (!this._chatMenu) {
      return;
    }
    this._chatMenu.clearItems();

    const contextMenuPrompts = this._prompts.filter(p => p.category === 'context_menu' || p.category === 'chat');

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

  setSettings(settings: ISuggestedEditsSettings): void {
    this._settings = settings;
    this.update();
  }

  private _getSnapshot(): INotebookSnapshot | null {
    if (!this._tracker || !this._tracker.currentWidget) {
      return null;
    }
    const maxChars = this._settings?.maxCellCharacters ?? 10000;
    return buildSnapshot(this._tracker.currentWidget, maxChars);
  }

  public async executePrompt(promptText: string) {
    this._view = 'chat';
    await this._handleSendMessage(promptText);
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

  private async _handleCreatePrompt(
    name: string,
    content: string,
    description: string,
    category: 'chat_snippet' | 'context_menu'
  ): Promise<string | void> {
    try {
      const p = await savePrompt(
        name,
        content,
        undefined,
        description,
        category
      );
      await this.loadPrompts();
      return p.id;
    } catch (err) {
      console.error('Failed to create prompt', err);
    }
  }

  private async _handleUpdatePrompt(
    name: string,
    content: string,
    description: string,
    id: string,
    category: 'chat_snippet' | 'context_menu'
  ) {
    try {
      await savePrompt(name, content, id, description, category);
      await this.loadPrompts();
    } catch (err) {
      console.error('Failed to update prompt', err);
    }
  }

  private async _handleDeletePrompt(id: string) {
    try {
      await deletePrompt(id);
      await this.loadPrompts();
    } catch (err) {
      console.error('Failed to delete prompt', err);
    }
  }

  protected render(): JSX.Element {
    const snippets = this._prompts.filter(p => p.category === 'chat_snippet');
    const contextMenus = this._prompts.filter(p => p.category === 'context_menu' || p.category === 'chat');

    return (
      <div
        className="jp-selenepy-chatSidebar-wrapper"
        style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <div
          style={{
            padding: '4px',
            textAlign: 'right',
            borderBottom: '1px solid var(--jp-border-color2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '8px' }}>View:</span>
          <select
            value={this._view}
            onChange={e => {
              this._view = e.target.value as 'chat' | 'chat_snippet' | 'context_menu';
              this.update();
            }}
            className="jp-selenepy-promptSelector"
            style={{ width: 'auto', marginBottom: 0, border: 'none', background: 'transparent' }}
          >
            <option value="chat">Chat</option>
            <option value="chat_snippet">Manage Chat Snippets</option>
            <option value="context_menu">Manage Context Menus</option>
          </select>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {this._view === 'chat' && (
            <ChatPanel
              messages={this._messages}
              isStreaming={this._isStreaming}
              onSendMessage={msg => void this._handleSendMessage(msg)}
              onClear={() => this._handleClear()}
              hasApiKey={!!this._settings?.openaiApiKey}
              snippets={snippets}
            />
          )}

          {this._view === 'context_menu' && (
            <div className="jp-selenepy-promptSettings-cards">
              <PromptEditorCard
                title="Right-Click Menu Options"
                prompts={contextMenus}
                selectedPromptId={this._selectedContextMenuId}
                onSelectPrompt={id => {
                  this._selectedContextMenuId = id;
                  this.update();
                }}
                onUpdatePrompt={(n, c, d, i) =>
                  void this._handleUpdatePrompt(n, c, d, i, 'context_menu')
                }
                onCreatePrompt={(n, c, d) =>
                  this._handleCreatePrompt(n, c, d, 'context_menu')
                }
                onDeletePrompt={i => void this._handleDeletePrompt(i)}
              />
            </div>
          )}

          {this._view === 'chat_snippet' && (
            <div className="jp-selenepy-promptSettings-cards">
              <PromptEditorCard
                title="Reusable Chat Snippets"
                prompts={snippets}
                selectedPromptId={this._selectedSnippetId}
                onSelectPrompt={id => {
                  this._selectedSnippetId = id;
                  this.update();
                }}
                onUpdatePrompt={(n, c, d, i) =>
                  void this._handleUpdatePrompt(n, c, d, i, 'chat_snippet')
                }
                onCreatePrompt={(n, c, d) =>
                  this._handleCreatePrompt(n, c, d, 'chat_snippet')
                }
                onDeletePrompt={i => void this._handleDeletePrompt(i)}
                showDescription={false}
                createNewLabel="➕ Create New Snippet..."
                selectLabel="Select Snippet:"
              />
            </div>
          )}
        </div>
      </div>
    );
  }
}
