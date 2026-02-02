import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';

import type {
  IResolvedSuggestion,
  SuggestionScanMode,
  IPrompt
} from '../types';
import { SuggestedEditsPanel } from './components/SuggestedEditsPanel';
import { PromptSettingsPanel } from './components/suggestions/PromptSettingsPanel';
import { fetchPrompts, savePrompt, deletePrompt } from './api';

/**
 * Sidebar widget for displaying LLM suggested edits, backed by React.
 */
export class SuggestedEditsSidebar extends ReactWidget {
  constructor() {
    super();
    this.id = 'selenejs-suggested-edits-sidebar';
    this.addClass('jp-selenepy-suggestedEdits');
    this._loadPrompts();
  }

  private async _loadPrompts() {
    try {
      this._prompts = await fetchPrompts();
      // Ensure we have valid selections
      if (!this._prompts.find(p => p.id === this._selectedLocalPromptId)) {
        this._selectedLocalPromptId = 'default';
      }
      if (!this._prompts.find(p => p.id === this._selectedGlobalPromptId)) {
        this._selectedGlobalPromptId = 'default';
      }
      this.update();
    } catch (err) {
      console.error('Failed to load prompts', err);
    }
  }

  private async _performPromptAction<T>(
    action: () => Promise<T>,
    errorMessage: string
  ): Promise<T | void> {
    try {
      const result = await action();
      await this._loadPrompts();
      this.update();
      return result;
    } catch (err) {
      console.error(errorMessage, err);
      this.showError(errorMessage);
    }
  }

  private _handleCreatePrompt(
    name: string,
    content: string
  ): Promise<string | void> {
    return this._performPromptAction(async () => {
      const prompt = await savePrompt(name, content);
      return prompt.id;
    }, 'Failed to create prompt.');
  }

  private _handleUpdatePrompt(name: string, content: string, id: string): void {
    void this._performPromptAction(
      () => savePrompt(name, content, id),
      'Failed to update prompt.'
    );
  }

  private _handleDeletePrompt(id: string): void {
    const deleteAction = async () => {
      await deletePrompt(id);
      // Reset selection if deleted prompt was active
      if (this._selectedLocalPromptId === id) {
        this._selectedLocalPromptId = 'default';
      }
      if (this._selectedGlobalPromptId === id) {
        this._selectedGlobalPromptId = 'default';
      }
    };;

    void this._performPromptAction(deleteAction, 'Failed to delete prompt.');
  }

  getSelectedPromptId(mode: SuggestionScanMode): string {
    return mode === 'full'
      ? this._selectedGlobalPromptId
      : this._selectedLocalPromptId;
  }

  get refreshContextRequested(): ISignal<SuggestedEditsSidebar, void> {
    return this._refreshContextRequested;
  }

  get refreshFullRequested(): ISignal<SuggestedEditsSidebar, void> {
    return this._refreshFullRequested;
  }

  get applyRequested(): ISignal<SuggestedEditsSidebar, IResolvedSuggestion> {
    return this._applyRequested;
  }

  get pauseRequested(): ISignal<SuggestedEditsSidebar, void> {
    return this._pauseRequested;
  }

  get dismissRequested(): ISignal<SuggestedEditsSidebar, IResolvedSuggestion> {
    return this._dismissRequested;
  }

  showIdle(): void {
    this._localSuggestions = [null, null];
    this._globalSuggestion = null;
    this._status = 'Waiting for notebook activity.';
    this.update();
  }

  showLoading(message = 'Streaming suggestions…'): void {
    this._status = message;
    this.update();
  }

  showError(message: string): void {
    this._status = message;
    this.update();
  }

  setStatus(message: string): void {
    this._status = message;
    this.update();
  }

  setPaused(paused: boolean): void {
    this._isPaused = paused;
    this.update();
  }

  beginLocalStream(): void {
    this._localSuggestions = [null, null];
    this.update();
  }

  beginGlobalStream(): void {
    this._globalSuggestion = null;
    this.update();
  }

  pushLocalSuggestion(suggestion: IResolvedSuggestion): void {
    this._localSuggestions[1] = this._localSuggestions[0];
    this._localSuggestions[0] = suggestion;
    this.update();
  }

  setGlobalSuggestion(suggestion: IResolvedSuggestion): void {
    this._globalSuggestion = suggestion;
    this.update();
  }

  showComplete(mode: SuggestionScanMode): void {
    if (mode === 'full') {
      this._status = this._globalSuggestion
        ? 'Global suggestion ready.'
        : 'No global suggestions found.';
    } else {
      this._status = this._localSuggestions.some(s => s !== null)
        ? 'Latest suggestions ready.'
        : 'No new local suggestions.';
    }
    this.update();
  }

  protected render(): JSX.Element {
    if (this._view === 'settings') {
      return (
        <PromptSettingsPanel
          prompts={this._prompts}
          selectedLocalPromptId={this._selectedLocalPromptId}
          selectedGlobalPromptId={this._selectedGlobalPromptId}
          onSelectLocal={id => {
            this._selectedLocalPromptId = id;
            this.update();
          }}
          onSelectGlobal={id => {
            this._selectedGlobalPromptId = id;
            this.update();
          }}
          onCreatePrompt={(name, content) =>
            this._handleCreatePrompt(name, content)
          }
          onUpdatePrompt={(name, content, id) =>
            this._handleUpdatePrompt(name, content, id)
          }
          onDeletePrompt={id => this._handleDeletePrompt(id)}
          onBack={() => {
            this._view = 'home';
            this.update();
          }}
        />
      );
    }

    return (
      <SuggestedEditsPanel
        status={this._status}
        isPaused={this._isPaused}
        localSuggestions={this._localSuggestions}
        globalSuggestion={this._globalSuggestion}
        onRefreshContext={() => this._refreshContextRequested.emit(void 0)}
        onRefreshFull={() => this._refreshFullRequested.emit(void 0)}
        onPauseToggle={() => this._pauseRequested.emit(void 0)}
        onApply={s => this._applyRequested.emit(s)}
        onDismiss={(s, idx) => {
          this._dismissRequested.emit(s);
          if (typeof idx === 'number') {
            this.handleLocalDismiss(idx);
          } else {
            this._globalSuggestion = null;
            this.updateStatusAfterRemoval();
            this.update();
          }
        }}
        onOpenSettings={() => {
          this._view = 'settings';
          this.update();
        }}
      />
    );
  }

  private handleLocalDismiss(index: number): void {
    // Remove the item and shift subsequent items up
    this._localSuggestions.splice(index, 1);
    this._localSuggestions.push(null);

    this.updateStatusAfterRemoval();
    this.update();
  }

  private updateStatusAfterRemoval(): void {
    const hasAny =
      this._localSuggestions.some(s => s !== null) ||
      this._globalSuggestion !== null;
    if (!hasAny) {
      this._status = 'All suggestions dismissed.';
    }
  }

  private _status = '';
  private _isPaused = false;
  private _localSuggestions: (IResolvedSuggestion | null)[] = [null, null];
  private _globalSuggestion: IResolvedSuggestion | null = null;
  private _prompts: IPrompt[] = [];
  private _selectedLocalPromptId: string = 'default';
  private _selectedGlobalPromptId: string = 'default';
  private _view: 'home' | 'settings' = 'home';

  private readonly _refreshContextRequested = new Signal<
    SuggestedEditsSidebar,
    void
  >(this);
  private readonly _refreshFullRequested = new Signal<
    SuggestedEditsSidebar,
    void
  >(this);
  private readonly _applyRequested = new Signal<
    SuggestedEditsSidebar,
    IResolvedSuggestion
  >(this);
  private readonly _pauseRequested = new Signal<SuggestedEditsSidebar, void>(
    this
  );
  private readonly _dismissRequested = new Signal<
    SuggestedEditsSidebar,
    IResolvedSuggestion
  >(this);
}
