import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';

import type { IResolvedSuggestion, SuggestionScanMode } from '../../types';
import { SuggestedEditsPanel } from './components/SuggestedEditsPanel';
import { PromptSettingsPanel } from './components/PromptSettingsPanel';
import { usePrompts } from '../hooks/usePrompts';
import { SidebarLayout } from '../components/SidebarLayout';

/**
 * Sidebar widget for displaying LLM suggested edits, backed by React.
 */
export class SuggestedEditsSidebar extends ReactWidget {
  constructor() {
    super();
    this.id = 'selenejs-suggested-edits-sidebar';
    this.addClass('jp-selenepy-suggestedEdits');
  }

  private _status = '';
  private _isPaused = false;
  private _hasApiKey = false;
  private _localSuggestions: (IResolvedSuggestion | null)[] = [null, null];
  private _globalSuggestion: IResolvedSuggestion | null = null;
  private _selectedLocalPromptId: string = 'default_local';
  private _selectedGlobalPromptId: string = 'default_global';
  private _view: 'home' | 'settings' = 'home';

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

  setHasApiKey(hasApiKey: boolean): void {
    this._hasApiKey = hasApiKey;
    this.update();
  }

  beginLocalStream(): void {
    this.update();
  }

  beginGlobalStream(): void {
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
    return (
      <SuggestedEditsSidebarContent
        view={this._view}
        status={this._status}
        isPaused={this._isPaused}
        hasApiKey={this._hasApiKey}
        localSuggestions={this._localSuggestions}
        globalSuggestion={this._globalSuggestion}
        selectedLocalPromptId={this._selectedLocalPromptId}
        selectedGlobalPromptId={this._selectedGlobalPromptId}
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
        onBack={() => {
          this._view = 'home';
          this.update();
        }}
        onSelectLocal={id => {
          this._selectedLocalPromptId = id;
          this.update();
        }}
        onSelectGlobal={id => {
          this._selectedGlobalPromptId = id;
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

/**
 * Functional component wrapper to use hooks.
 */
const SuggestedEditsSidebarContent: React.FC<{
  view: 'home' | 'settings';
  status: string;
  isPaused: boolean;
  hasApiKey: boolean;
  localSuggestions: (IResolvedSuggestion | null)[];
  globalSuggestion: IResolvedSuggestion | null;
  selectedLocalPromptId: string;
  selectedGlobalPromptId: string;
  onRefreshContext: () => void;
  onRefreshFull: () => void;
  onPauseToggle: () => void;
  onApply: (s: IResolvedSuggestion) => void;
  onDismiss: (s: IResolvedSuggestion, idx?: number) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onSelectLocal: (id: string) => void;
  onSelectGlobal: (id: string) => void;
}> = props => {
  const { prompts, updatePrompt, createPrompt, removePrompt } =
    usePrompts('suggestion');

  return (
    <SidebarLayout
      view={props.view === 'home' ? 'suggestions' : 'settings'}
      onViewChange={val => {
        if (val === 'suggestions') {
          props.onBack();
        } else {
          props.onOpenSettings();
        }
      }}
      options={[
        { value: 'suggestions', label: 'Suggestions' },
        { value: 'settings', label: 'Manage Prompts' }
      ]}
    >
      {props.view === 'settings' ? (
        <PromptSettingsPanel
          prompts={prompts}
          selectedLocalPromptId={props.selectedLocalPromptId}
          selectedGlobalPromptId={props.selectedGlobalPromptId}
          onSelectLocal={props.onSelectLocal}
          onSelectGlobal={props.onSelectGlobal}
          onUpdatePrompt={updatePrompt}
          onCreatePrompt={createPrompt}
          onDeletePrompt={removePrompt}
          onBack={props.onBack}
        />
      ) : (
        <SuggestedEditsPanel
          status={props.status}
          isPaused={props.isPaused}
          localSuggestions={props.localSuggestions}
          globalSuggestion={props.globalSuggestion}
          onRefreshContext={props.onRefreshContext}
          onRefreshFull={props.onRefreshFull}
          onPauseToggle={props.onPauseToggle}
          onApply={props.onApply}
          onDismiss={props.onDismiss}
          onOpenSettings={props.onOpenSettings}
          hasApiKey={props.hasApiKey}
        />
      )}
    </SidebarLayout>
  );
};
