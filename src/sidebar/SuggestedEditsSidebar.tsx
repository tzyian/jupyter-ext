import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';

import type {
  IResolvedSuggestion,
  SuggestionScanMode,
  IPrompt
} from '../types';
import { SuggestedEditsPanel } from './components/SuggestedEditsPanel';
import { PromptSettingsPanel } from './components/PromptSettingsPanel';
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
      // Ensure we have a valid selection
      if (!this._prompts.find(p => p.id === this._selectedPromptId)) {
        this._selectedPromptId = 'default';
      }
      this.update();
    } catch (err) {
      console.error('Failed to load prompts', err);
    }
  }

  private async _handleCreatePrompt(name: string, content: string) {
    try {
      const newPrompt = await savePrompt(name, content);
      await this._loadPrompts();
      this._selectedPromptId = newPrompt.id;
      this.update();
    } catch (err) {
      console.error('Failed to create prompt', err);
      this.showError('Failed to save prompt.');
    }
  }

  private async _handleUpdatePrompt(name: string, content: string, id: string) {
    try {
      await savePrompt(name, content, id);
      await this._loadPrompts();
      this.update();
    } catch (err) {
      console.error('Failed to update prompt', err);
      this.showError('Failed to save prompt.');
    }
  }

  private async _handleDeletePrompt(id: string) {
    try {
      await deletePrompt(id);
      await this._loadPrompts();
      this._selectedPromptId = 'default';
      this.update();
    } catch (err) {
      console.error('Failed to delete prompt', err);
      this.showError('Failed to delete prompt.');
    }
  }

  getSelectedPromptId(): string {
    return this._selectedPromptId;
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
          selectedPromptId={this._selectedPromptId}
          onSelectPrompt={id => {
            this._selectedPromptId = id;
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
    for (let i = index; i < this._localSuggestions.length - 1; i++) {
      this._localSuggestions[i] = this._localSuggestions[i + 1];
    }
    this._localSuggestions[this._localSuggestions.length - 1] = null;
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
  private _selectedPromptId: string = 'default';
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
