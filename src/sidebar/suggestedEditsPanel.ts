import { Signal, type ISignal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';

import type { IResolvedSuggestion, IReadonlyDiffSegment } from '../types';

const ROOT_CLASS = 'jp-selenepy-suggestedEdits';
const ITEM_CLASS = `${ROOT_CLASS}-item`;
const ITEM_BODY_CLASS = `${ITEM_CLASS}-body`;
const ITEM_CONTROLS_CLASS = `${ITEM_CLASS}-controls`;
const STATUS_CLASS = `${ROOT_CLASS}-status`;
const LIST_CLASS = `${ROOT_CLASS}-list`;
const HEADER_CLASS = `${ROOT_CLASS}-header`;
const ACTION_BUTTON_CLASS = `${ROOT_CLASS}-actionButton`;
const BUTTON_GROUP_CLASS = `${ROOT_CLASS}-buttonGroup`;
const DIFF_CONTAINER_CLASS = `${ITEM_CLASS}-diff`;
const DIFF_SEGMENT_CLASS = `${DIFF_CONTAINER_CLASS}-segment`;
const DIFF_SEGMENT_ADDED_CLASS = `${DIFF_SEGMENT_CLASS}-added`;
const DIFF_SEGMENT_REMOVED_CLASS = `${DIFF_SEGMENT_CLASS}-removed`;
const DIFF_SEGMENT_UNCHANGED_CLASS = `${DIFF_SEGMENT_CLASS}-unchanged`;

export class SuggestedEditsSidebar extends Widget {
  constructor() {
    super();
    this.addClass(ROOT_CLASS);

    const header = document.createElement('div');
    header.className = HEADER_CLASS;
    const title = document.createElement('h2');
    title.textContent = 'Suggested Edits';
    header.appendChild(title);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = BUTTON_GROUP_CLASS;

    const contextButton = document.createElement('button');
    contextButton.type = 'button';
    contextButton.className = ACTION_BUTTON_CLASS;
    contextButton.textContent = 'Refresh (context)';
    contextButton.addEventListener('click', () => {
      this._refreshContextRequested.emit(void 0);
    });

    const fullButton = document.createElement('button');
    fullButton.type = 'button';
    fullButton.className = ACTION_BUTTON_CLASS;
    fullButton.textContent = 'Refresh (full)';
    fullButton.addEventListener('click', () => {
      this._refreshFullRequested.emit(void 0);
    });

    buttonGroup.append(contextButton, fullButton);
    header.appendChild(buttonGroup);

    const status = document.createElement('div');
    status.className = STATUS_CLASS;

    const list = document.createElement('div');
    list.className = LIST_CLASS;

    this.node.append(header, status, list);

    this._statusNode = status;
    this._listNode = list;
    this.showIdle();
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

  get dismissRequested(): ISignal<SuggestedEditsSidebar, IResolvedSuggestion> {
    return this._dismissRequested;
  }

  showIdle(): void {
    this.setStatus('Waiting for notebook activity.');
    this.clearSuggestions();
  }

  showLoading(message = 'Streaming suggestions…'): void {
    this.setStatus(message);
    this.clearSuggestions();
  }

  showError(message: string): void {
    this.setStatus(message);
  }

  setStatus(message: string): void {
    this._statusNode.textContent = message;
  }

  clearSuggestions(): void {
    this._listNode.innerHTML = '';
  }

  appendSuggestion(suggestion: IResolvedSuggestion): void {
    const item = document.createElement('article');
    item.className = ITEM_CLASS;

    const body = document.createElement('div');
    body.className = ITEM_BODY_CLASS;

    const title = document.createElement('h3');
    title.textContent = suggestion.title;

    const description = document.createElement('p');
    description.textContent = suggestion.description;

    body.append(title, description);

    if (suggestion.rationale) {
      const rationale = document.createElement('pre');
      rationale.textContent = suggestion.rationale;
      body.append(rationale);
    }

    const proposed = document.createElement('details');
    proposed.className = DIFF_CONTAINER_CLASS;
    const summary = document.createElement('summary');
    summary.textContent = 'View proposed change';
    proposed.append(summary);

    const diffPre = document.createElement('pre');
    this.renderDiff(diffPre, suggestion.diffSegments);
    proposed.append(diffPre);

    body.append(proposed);

    const controls = document.createElement('div');
    controls.className = ITEM_CONTROLS_CLASS;

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'Apply';
    applyButton.className = ACTION_BUTTON_CLASS;
    applyButton.addEventListener('click', () => {
      this._applyRequested.emit(suggestion);
    });

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.textContent = 'Dismiss';
    dismissButton.className = ACTION_BUTTON_CLASS;
    dismissButton.addEventListener('click', () => {
      this._dismissRequested.emit(suggestion);
      item.remove();
      if (!this._listNode.hasChildNodes()) {
        this.setStatus('All suggestions dismissed.');
      }
    });

    controls.append(applyButton, dismissButton);
    item.append(body, controls);

    this._listNode.append(item);
  }

  showComplete(): void {
    if (!this._listNode.hasChildNodes()) {
      this.setStatus('No new suggestions.');
    } else {
      this.setStatus('Latest suggestions ready.');
    }
  }

  private renderDiff(
    container: HTMLElement,
    segments: IReadonlyDiffSegment[]
  ): void {
    container.textContent = '';
    for (const segment of segments) {
      const span = document.createElement('span');
      span.className = `${DIFF_SEGMENT_CLASS} ${this.classForSegment(segment)}`;
      span.textContent = segment.value;
      container.append(span);
    }
  }

  private classForSegment(segment: IReadonlyDiffSegment): string {
    switch (segment.type) {
      case 'added':
        return DIFF_SEGMENT_ADDED_CLASS;
      case 'removed':
        return DIFF_SEGMENT_REMOVED_CLASS;
      default:
        return DIFF_SEGMENT_UNCHANGED_CLASS;
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
  private readonly _dismissRequested = new Signal<
    SuggestedEditsSidebar,
    IResolvedSuggestion
  >(this);

  private readonly _statusNode: HTMLDivElement;
  private readonly _listNode: HTMLDivElement;
}
