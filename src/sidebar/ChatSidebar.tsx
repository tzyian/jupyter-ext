import { ReactWidget } from '@jupyterlab/apputils';
import React, { useEffect, useMemo } from 'react';
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
import { usePrompts } from './utils/usePrompts';
import { PromptEditorCard } from './components/common/PromptEditorCard';
import { Select } from './components/common/Select';
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

  protected render(): JSX.Element {
    const cellContext = this._getActiveCellContext();
    return (
      <ChatSidebarContent
        sidebar={this}
        view={this._view}
        messages={this._messages}
        isStreaming={this._isStreaming}
        settings={this._settings}
        selectedSnippetId={this._selectedSnippetId}
        selectedContextMenuId={this._selectedContextMenuId}
        onViewChange={v => {
          this._view = v;
          this.update();
        }}
        onSendMessage={msg => void this._handleSendMessage(msg)}
        onClear={() => this._handleClear()}
        onStop={() => {
          if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
          }
          this._isStreaming = false;
          this.update();
        }}
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
        cellContext={cellContext}
      />
    );
  }
}

/**
 * Functional component wrapper for ChatSidebar to use hooks.
 */
const ChatSidebarContent: React.FC<{
  sidebar: ChatSidebar;
  view: 'chat' | 'chat_snippet' | 'context_menu';
  messages: IChatMessage[];
  isStreaming: boolean;
  settings: ISuggestedEditsSettings | null;
  selectedSnippetId: string;
  selectedContextMenuId: string;
  onViewChange: (v: 'chat' | 'chat_snippet' | 'context_menu') => void;
  onSendMessage: (msg: string) => void;
  onClear: () => void;
  onStop: () => void;
  onSelectSnippet: (id: string) => void;
  onSelectContextMenu: (id: string) => void;
  onPromptsChanged: (prompts: IPrompt[]) => void;
  cellContext: { cellNumber: number; excerpt?: string } | null;
}> = props => {
  const promptCategories = useMemo<IPrompt['category'][]>(
    () => ['chat_snippet', 'context_menu', 'chat'],
    []
  );

  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts(promptCategories);

  useEffect(() => {
    props.onPromptsChanged(prompts);
  }, [prompts]);

  const snippets = prompts.filter(
    (p: IPrompt) => p.category === 'chat_snippet'
  );
  const contextMenus = prompts.filter(
    (p: IPrompt) => p.category === 'context_menu' || p.category === 'chat'
  );

  useEffect(() => {
    if (
      props.selectedSnippetId !== '__CREATE_NEW__' &&
      !snippets.some(p => p.id === props.selectedSnippetId)
    ) {
      props.onSelectSnippet('__CREATE_NEW__');
    }
  }, [snippets, props.selectedSnippetId]);

  useEffect(() => {
    if (
      props.selectedContextMenuId !== '__CREATE_NEW__' &&
      !contextMenus.some(p => p.id === props.selectedContextMenuId)
    ) {
      props.onSelectContextMenu('__CREATE_NEW__');
    }
  }, [contextMenus, props.selectedContextMenuId]);

  return (
    <div
      className="jp-selenepy-chatSidebar-wrapper"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div
        style={{
          padding: '4px',
          borderBottom: '1px solid var(--jp-border-color2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Select
          label="View:"
          value={props.view}
          onChange={val =>
            props.onViewChange(val as 'chat' | 'chat_snippet' | 'context_menu')
          }
          options={[
            { value: 'chat', label: 'Chat' },
            { value: 'chat_snippet', label: 'Manage Chat Snippets' },
            { value: 'context_menu', label: 'Manage Context Menus' }
          ]}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: '8px',
            width: '100%'
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {props.view === 'chat' && (
          <ChatPanel
            messages={props.messages}
            isStreaming={props.isStreaming}
            onSendMessage={props.onSendMessage}
            onClear={props.onClear}
            onStop={props.onStop}
            hasApiKey={!!props.settings?.openaiApiKey}
            snippets={snippets}
            cellContext={props.cellContext}
          />
        )}

        {props.view === 'context_menu' && (
          <div className="jp-selenepy-promptSettings-cards">
            <PromptEditorCard
              title="Right-Click Menu Options"
              prompts={contextMenus}
              selectedPromptId={props.selectedContextMenuId}
              onSelectPrompt={props.onSelectContextMenu}
              onUpdatePrompt={(n, c, d, i) =>
                updatePrompt(n, c, d, i, 'context_menu')
              }
              onCreatePrompt={(n, c, d) =>
                createPrompt(n, c, d, 'context_menu')
              }
              onDeletePrompt={removePrompt}
            />
          </div>
        )}

        {props.view === 'chat_snippet' && (
          <div className="jp-selenepy-promptSettings-cards">
            <PromptEditorCard
              title="Reusable Chat Snippets"
              prompts={snippets}
              selectedPromptId={props.selectedSnippetId}
              onSelectPrompt={props.onSelectSnippet}
              onUpdatePrompt={(n, c, d, i) =>
                updatePrompt(n, c, d, i, 'chat_snippet')
              }
              onCreatePrompt={(n, c, d) =>
                createPrompt(n, c, d, 'chat_snippet')
              }
              onDeletePrompt={removePrompt}
              showDescription={false}
              createNewLabel="➕ Create New Snippet..."
              selectLabel="Select Snippet:"
            />
          </div>
        )}
      </div>
    </div>
  );
};
