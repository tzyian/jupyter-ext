import { ReactWidget } from '@jupyterlab/apputils';
import { Menu } from '@lumino/widgets';
import React from 'react';
import type { IPrompt } from '../types';
import { CommandIDs } from './commands';
import { ContextMenuSidebarContent } from './components/ContextMenuSidebarContent';
import {
  PROMPT_CATEGORY_CHAT,
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET,
  type ContextMenuView
} from './constants';

export class ContextMenuSidebar extends ReactWidget {
  private _view: ContextMenuView = PROMPT_CATEGORY_CONTEXT_MENU;
  private _selectedContextMenuId = '__CREATE_NEW__';
  private _selectedNotebookSnippetId = '__CREATE_NEW__';
  private _prompts: IPrompt[] = [];

  private _chatMenu: Menu | null = null;
  private _snippetMenu: Menu | null = null;
  private _menuFingerprints = { chat: '', snippet: '' };

  constructor() {
    super();
    this.id = 'selenejs-context-menu-sidebar';
    this.addClass('jp-selenepy-contextmenu');
    this.title.label = 'Context Menus';
    this.title.caption = 'Selenejs Context Menus';
    // Using a list-like icon for context menus
    this.title.iconClass = 'jp-SpreadsheetIcon';
  }

  public setMenus(chatMenu: Menu, snippetMenu: Menu) {
    this._chatMenu = chatMenu;
    this._snippetMenu = snippetMenu;
    this._updateMenus();
  }

  private _updateMenus() {
    if (this._chatMenu) {
      const chatPrompts = this._prompts.filter(
        p =>
          p.category === PROMPT_CATEGORY_CONTEXT_MENU ||
          p.category === PROMPT_CATEGORY_CHAT
      );
      const chatFingerprint = chatPrompts
        .map(
          p =>
            `${p.id}:${p.name}:${p.description ?? ''}:${p.content}:${
              p.category ?? ''
            }`
        )
        .join('|');

      if (chatFingerprint !== this._menuFingerprints.chat) {
        this._menuFingerprints.chat = chatFingerprint;
        this._chatMenu.clearItems();
        for (const p of chatPrompts) {
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
    }

    if (this._snippetMenu) {
      const snippetPrompts = this._prompts.filter(
        p => p.category === PROMPT_CATEGORY_NOTEBOOK_SNIPPET
      );
      const snippetFingerprint = snippetPrompts
        .map(
          p =>
            `${p.id}:${p.name}:${p.description ?? ''}:${p.content}:${
              p.category ?? ''
            }`
        )
        .join('|');

      if (snippetFingerprint !== this._menuFingerprints.snippet) {
        this._menuFingerprints.snippet = snippetFingerprint;
        this._snippetMenu.clearItems();
        for (const p of snippetPrompts) {
          this._snippetMenu.addItem({
            command: CommandIDs.insertNotebookSnippet,
            args: {
              promptName: p.name,
              promptDescription: p.description || '',
              promptContent: p.content
            }
          });
        }
      }
    }
  }

  public openPromptManager(view: ContextMenuView) {
    this._view = view;
    this.update();
  }

  protected render(): JSX.Element {
    return (
      <ContextMenuSidebarContent
        view={this._view}
        selectedContextMenuId={this._selectedContextMenuId}
        selectedNotebookSnippetId={this._selectedNotebookSnippetId}
        onViewChange={v => {
          this._view = v;
          this.update();
        }}
        onSelectContextMenu={id => {
          this._selectedContextMenuId = id;
          this.update();
        }}
        onSelectNotebookSnippet={id => {
          this._selectedNotebookSnippetId = id;
          this.update();
        }}
        onPromptsChanged={prompts => {
          this._prompts = prompts;
          this._updateMenus();
        }}
      />
    );
  }
}
