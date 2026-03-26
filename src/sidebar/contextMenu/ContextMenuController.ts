import { IDisposable } from '@lumino/disposable';
import { Menu } from '@lumino/widgets';
import type { IPrompt } from '../types';
import { CommandIDs } from '../../types';
import {
  PROMPT_CATEGORY_CONTEXT_MENU,
  PROMPT_CATEGORY_NOTEBOOK_SNIPPET
} from './constants';

/**
 * Controller for synchronizing prompt data with Lumino context menus.
 */
export class ContextMenuController implements IDisposable {
  private _chatMenu: Menu | null = null;
  private _snippetMenu: Menu | null = null;
  private _menuFingerprints = { chat: '', snippet: '' };
  private _isDisposed = false;

  constructor(chatMenu: Menu, snippetMenu: Menu) {
    this._chatMenu = chatMenu;
    this._snippetMenu = snippetMenu;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._chatMenu = null;
    this._snippetMenu = null;
  }

  /**
   * Handle changes to the prompts list and update menus accordingly.
   */
  public onPromptsChanged(prompts: IPrompt[]): void {
    if (this.isDisposed) {
      return;
    }
    this._updateMenus(prompts);
  }

  private _updateMenus(prompts: IPrompt[]) {
    if (this._chatMenu) {
      const chatPrompts = prompts.filter(
        p => p.category === PROMPT_CATEGORY_CONTEXT_MENU
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

        this._chatMenu.addItem({ type: 'separator' });
        this._chatMenu.addItem({
          command: CommandIDs.openContextMenuPromptsConfig
        });
      }
    }

    if (this._snippetMenu) {
      const snippetPrompts = prompts.filter(
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

        this._snippetMenu.addItem({ type: 'separator' });
        this._snippetMenu.addItem({
          command: CommandIDs.openNotebookSnippetsConfig
        });
      }
    }
  }
}
