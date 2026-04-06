import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';

import type { SuggestionScanMode } from '../types';
import type { IResolvedSuggestion } from './types';
import { useSuggestedEditsStore } from './useSuggestedEditsStore';
import { SUGGESTIONS_SIDEBAR_ID } from '../../types';
import { SuggestedEditsSidebarContent } from './components/SuggestedEditsSidebarContent';

/**
 * Sidebar widget for displaying LLM suggested edits, backed by React.
 */
export class SuggestedEditsSidebar extends ReactWidget {
  constructor() {
    super();
    this.id = SUGGESTIONS_SIDEBAR_ID;
    this.addClass('jp-selenepy-suggestedEdits');
    this.title.label = 'Suggestions';
    this.title.caption = 'LLM Suggested Edits';
  }

  setController(controller: unknown): void {
    void controller;
  }

  getSelectedPromptId(mode: SuggestionScanMode): string {
    const { selectedGlobalPromptId, selectedLocalPromptId } =
      useSuggestedEditsStore.getState();
    return mode === 'full' ? selectedGlobalPromptId : selectedLocalPromptId;
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

  get viewChanged(): ISignal<SuggestedEditsSidebar, 'home' | 'settings'> {
    return this._viewChanged;
  }

  get promptSelected(): ISignal<
    SuggestedEditsSidebar,
    { mode: SuggestionScanMode; id: string }
  > {
    return this._promptSelected;
  }

  showIdle(): void {
    const { setLocalSuggestions, setGlobalSuggestion, setStatus } =
      useSuggestedEditsStore.getState();
    setLocalSuggestions([null, null]);
    setGlobalSuggestion(null);
    setStatus('Waiting for notebook activity.');
  }

  showLoading(message = 'Streaming suggestions…'): void {
    useSuggestedEditsStore.getState().setStatus(message);
  }

  showError(message: string): void {
    useSuggestedEditsStore.getState().setStatus(message);
  }

  setStatus(message: string): void {
    useSuggestedEditsStore.getState().setStatus(message);
  }

  setPaused(paused: boolean): void {
    useSuggestedEditsStore.getState().setPaused(paused);
  }

  setHasApiKey(hasApiKey: boolean): void {
    useSuggestedEditsStore.getState().setHasApiKey(hasApiKey);
  }

  beginLocalStream(): void {
    // No-op: stream progress is reflected through store status updates.
  }

  beginGlobalStream(): void {
    // No-op: stream progress is reflected through store status updates.
  }

  pushLocalSuggestion(suggestion: IResolvedSuggestion): void {
    useSuggestedEditsStore.getState().addLocalSuggestion(suggestion);
  }

  setGlobalSuggestion(suggestion: IResolvedSuggestion): void {
    useSuggestedEditsStore.getState().setGlobalSuggestion(suggestion);
  }

  showComplete(mode: SuggestionScanMode): void {
    const { globalSuggestion, localSuggestions, setStatus } =
      useSuggestedEditsStore.getState();
    if (mode === 'full') {
      setStatus(
        globalSuggestion
          ? 'Global suggestion ready.'
          : 'No global suggestions found.'
      );
    } else {
      setStatus(
        localSuggestions.some(s => s !== null)
          ? 'Latest suggestions ready.'
          : 'No new local suggestions.'
      );
    }
  }

  protected render(): JSX.Element {
    return (
      <SuggestedEditsSidebarContent
        onRefreshContext={() => this._refreshContextRequested.emit(void 0)}
        onRefreshFull={() => this._refreshFullRequested.emit(void 0)}
        onPauseToggle={() => this._pauseRequested.emit(void 0)}
        onApply={s => this._applyRequested.emit(s)}
        onDismiss={s => this._dismissRequested.emit(s)}
        onOpenSettings={() => {
          useSuggestedEditsStore.getState().setView('settings');
          this._viewChanged.emit('settings');
        }}
        onBack={() => {
          useSuggestedEditsStore.getState().setView('home');
          this._viewChanged.emit('home');
        }}
        onSelectLocal={id => {
          useSuggestedEditsStore.getState().setSelectedLocalPromptId(id);
          this._promptSelected.emit({ mode: 'context', id });
        }}
        onSelectGlobal={id => {
          useSuggestedEditsStore.getState().setSelectedGlobalPromptId(id);
          this._promptSelected.emit({ mode: 'full', id });
        }}
      />
    );
  }

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
  private readonly _viewChanged = new Signal<
    SuggestedEditsSidebar,
    'home' | 'settings'
  >(this);
  private readonly _promptSelected = new Signal<
    SuggestedEditsSidebar,
    { mode: SuggestionScanMode; id: string }
  >(this);
}
