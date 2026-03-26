import { ReactWidget } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import React from 'react';
import { ContextMenuSidebarContent } from './ContextMenuSidebarContent';
import {
  PROMPT_CATEGORY_CONTEXT_MENU,
  type ContextMenuView
} from './constants';
import { CONTEXT_MENU_SIDEBAR_ID } from '../../types';

export class ContextMenuSidebar extends ReactWidget {
  public readonly promptsChanged = new Signal<this, any[]>(this);

  private _view: ContextMenuView = PROMPT_CATEGORY_CONTEXT_MENU;
  private _selectedContextMenuId = '__CREATE_NEW__';
  private _selectedNotebookSnippetId = '__CREATE_NEW__';

  constructor() {
    super();
    this.id = CONTEXT_MENU_SIDEBAR_ID;
    this.addClass('jp-selenepy-contextmenu');
    this.title.label = 'Context Menus';
    this.title.caption = 'Selenejs Context Menus';
    // Using a list-like icon for context menus
    this.title.iconClass = 'jp-SpreadsheetIcon';
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
          this.promptsChanged.emit(prompts);
        }}
      />
    );
  }
}
