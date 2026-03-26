import { ReactWidget } from '@jupyterlab/apputils';
import { Signal, type ISignal } from '@lumino/signaling';
import React from 'react';
import { IResolvedSuggestion } from './types';
import { SuggestedEditsSidebarContent } from './components/SuggestedEditsSidebarContent';
import { SUGGESTIONS_SIDEBAR_ID } from '../../types';
import { SuggestedEditsController } from './suggestedEditsController';

/**
 * Sidebar widget for displaying LLM suggested edits, backed by React.
 * This class is a thin Lumino wrapper that delegates rendering to React.
 */
export class SuggestedEditsSidebar extends ReactWidget {
  private _controller: SuggestedEditsController | null = null;

  constructor() {
    super();
    this.id = SUGGESTIONS_SIDEBAR_ID;
    this.addClass('jp-selenepy-suggestedEdits');
    this.title.label = 'Suggestions';
    this.title.caption = 'LLM Suggested Edits';
  }

  setController(controller: SuggestedEditsController): void {
    this._controller = controller;
    this.update();
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
    { mode: 'context' | 'full'; id: string }
  > {
    return this._promptSelected;
  }

  protected render(): JSX.Element {
    if (!this._controller) {
      return <div className="jp-selenepy-loading">Loading suggestions...</div>;
    }

    return (
      <SuggestedEditsSidebarContent
        onRefreshContext={() => this._refreshContextRequested.emit(void 0)}
        onRefreshFull={() => this._refreshFullRequested.emit(void 0)}
        onPauseToggle={() => this._pauseRequested.emit(void 0)}
        onApply={s => this._applyRequested.emit(s)}
        onDismiss={s => this._dismissRequested.emit(s)}
        onOpenSettings={() => this._viewChanged.emit('settings')}
        onBack={() => this._viewChanged.emit('home')}
        onSelectLocal={id => this._promptSelected.emit({ mode: 'context', id })}
        onSelectGlobal={id => this._promptSelected.emit({ mode: 'full', id })}
      />
    );
  }

  private readonly _refreshContextRequested = new Signal<this, void>(this);
  private readonly _refreshFullRequested = new Signal<this, void>(this);
  private readonly _applyRequested = new Signal<this, IResolvedSuggestion>(
    this
  );
  private readonly _pauseRequested = new Signal<this, void>(this);
  private readonly _dismissRequested = new Signal<this, IResolvedSuggestion>(
    this
  );
  private readonly _viewChanged = new Signal<this, 'home' | 'settings'>(this);
  private readonly _promptSelected = new Signal<
    this,
    { mode: 'context' | 'full'; id: string }
  >(this);
}
