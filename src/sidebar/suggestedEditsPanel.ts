import { Signal, type ISignal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';

import type {
  IResolvedSuggestion,
  SuggestionContextType,
  SuggestionScanMode
} from '../types';
import { buildSuggestionCard } from './components/suggestionCard';

const ROOT_CLASS = 'jp-selenepy-suggestedEdits';
const HEADER_CLASS = `${ROOT_CLASS}-header`;
const BUTTON_GROUP_CLASS = `${ROOT_CLASS}-buttonGroup`;
const ACTION_BUTTON_CLASS = `${ROOT_CLASS}-actionButton`;
const STATUS_CLASS = `${ROOT_CLASS}-status`;
const SECTION_HEADER_CLASS = `${ROOT_CLASS}-sectionHeader`;
const LOCAL_SECTION_CLASS = `${ROOT_CLASS}-localSection`;
const GLOBAL_SECTION_CLASS = `${ROOT_CLASS}-globalSection`;
const SLOT_GROUP_CLASS = `${ROOT_CLASS}-slotGroup`;
const SLOT_CLASS = `${ROOT_CLASS}-slot`;
const SLOT_EMPTY_CLASS = `${SLOT_CLASS}-empty`;

interface ISlotState {
  readonly type: SuggestionContextType;
  readonly container: HTMLDivElement;
  suggestion: IResolvedSuggestion | null;
  readonly index?: number;
}

/**
 * Sidebar widget for displaying LLM suggested edits.
 */
export class SuggestedEditsSidebar extends Widget {
  constructor() {
    super();
    this.addClass(ROOT_CLASS);

    this._buildHeader();
    this._buildStatus();
    this._buildLocalSection();
    this._buildGlobalSection();

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

  get pauseRequested(): ISignal<SuggestedEditsSidebar, void> {
    return this._pauseRequested;
  }

  get dismissRequested(): ISignal<SuggestedEditsSidebar, IResolvedSuggestion> {
    return this._dismissRequested;
  }

  showIdle(): void {
    this.resetAllSlots();
    this.setStatus('Waiting for notebook activity.');
  }

  showLoading(message = 'Streaming suggestions…'): void {
    this.setStatus(message);
  }

  showError(message: string): void {
    this.setStatus(message);
  }

  setStatus(message: string): void {
    this._statusNode.textContent = message;
  }

  setPaused(paused: boolean): void {
    this._pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  beginLocalStream(): void {
    this.clearLocalSuggestions();
  }

  beginGlobalStream(): void {
    this.clearGlobalSuggestion();
  }

  pushLocalSuggestion(suggestion: IResolvedSuggestion): void {
    this._localSlots[1].suggestion = this._localSlots[0].suggestion;
    this._localSlots[0].suggestion = suggestion;
    this.renderLocalSlots();
  }

  setGlobalSuggestion(suggestion: IResolvedSuggestion): void {
    this._globalSlot.suggestion = suggestion;
    this.renderGlobalSlot();
  }

  showComplete(mode: SuggestionScanMode): void {
    if (mode === 'full') {
      this.setStatus(
        this.hasGlobalSuggestion()
          ? 'Global suggestion ready.'
          : 'No global suggestions found.'
      );
      return;
    }

    this.setStatus(
      this.hasAnyLocalSuggestion()
        ? 'Latest suggestions ready.'
        : 'No new local suggestions.'
    );
  }

  private _buildHeader(): void {
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

    this._pauseButton = document.createElement('button');
    this._pauseButton.type = 'button';
    this._pauseButton.className = ACTION_BUTTON_CLASS;
    this._pauseButton.textContent = 'Pause';
    this._pauseButton.addEventListener('click', () => {
      this._pauseRequested.emit(void 0);
    });

    buttonGroup.append(contextButton, fullButton, this._pauseButton);
    header.appendChild(buttonGroup);
    this.node.append(header);
  }

  private _buildStatus(): void {
    this._statusNode = document.createElement('div');
    this._statusNode.className = STATUS_CLASS;
    this.node.append(this._statusNode);
  }

  private _buildLocalSection(): void {
    const localSection = document.createElement('section');
    localSection.className = LOCAL_SECTION_CLASS;

    const localHeader = document.createElement('h3');
    localHeader.className = SECTION_HEADER_CLASS;
    localHeader.textContent = 'Local Context Suggestions (auto updates)';
    localSection.append(localHeader);

    const localGroup = document.createElement('div');
    localGroup.className = SLOT_GROUP_CLASS;
    localSection.append(localGroup);

    for (let index = 0; index < 2; index++) {
      const slotContainer = document.createElement('div');
      slotContainer.className = SLOT_CLASS;
      localGroup.append(slotContainer);
      this._localSlots.push({
        type: 'local',
        container: slotContainer,
        suggestion: null,
        index
      });
    }

    this.node.append(localSection);
  }

  private _buildGlobalSection(): void {
    const globalSection = document.createElement('section');
    globalSection.className = GLOBAL_SECTION_CLASS;

    const globalHeader = document.createElement('h3');
    globalHeader.className = SECTION_HEADER_CLASS;
    globalHeader.textContent = 'Global Notebook Suggestion (manual refresh)';
    globalSection.append(globalHeader);

    const globalSlotContainer = document.createElement('div');
    globalSlotContainer.className = SLOT_CLASS;
    globalSection.append(globalSlotContainer);
    this._globalSlot = {
      type: 'global',
      container: globalSlotContainer,
      suggestion: null
    };

    this.node.append(globalSection);
  }

  private resetAllSlots(): void {
    this.clearLocalSuggestions();
    this.clearGlobalSuggestion();
  }

  private clearLocalSuggestions(): void {
    for (const slot of this._localSlots) {
      slot.suggestion = null;
    }
    this.renderLocalSlots();
  }

  private clearGlobalSuggestion(): void {
    this._globalSlot.suggestion = null;
    this.renderGlobalSlot();
  }

  private renderLocalSlots(): void {
    for (const slot of this._localSlots) {
      this.renderSlot(slot, slot.index ?? 0);
    }
  }

  private renderGlobalSlot(): void {
    this.renderSlot(this._globalSlot);
  }

  private renderSlot(slot: ISlotState, localIndex?: number): void {
    const container = slot.container;
    container.textContent = '';

    if (!slot.suggestion) {
      const placeholder = document.createElement('p');
      placeholder.className = SLOT_EMPTY_CLASS;
      placeholder.textContent =
        slot.type === 'global'
          ? 'Global suggestion will appear here.'
          : 'Local suggestions will appear here.';
      container.append(placeholder);
      return;
    }

    const card = buildSuggestionCard({
      suggestion: slot.suggestion,
      type: slot.type,
      localIndex,
      onApply: s => this._applyRequested.emit(s),
      onDismiss: (s, idx) => {
        this._dismissRequested.emit(s);
        if (slot.type === 'local' && typeof idx === 'number') {
          this.removeLocalSuggestion(idx);
        } else {
          this.clearGlobalSuggestion();
          this.updateStatusAfterRemoval();
        }
      }
    });
    container.append(card);
  }

  private removeLocalSuggestion(index: number): void {
    for (let i = index; i < this._localSlots.length - 1; i++) {
      this._localSlots[i].suggestion = this._localSlots[i + 1].suggestion;
    }
    this._localSlots[this._localSlots.length - 1].suggestion = null;
    this.renderLocalSlots();
    this.updateStatusAfterRemoval();
  }

  private updateStatusAfterRemoval(): void {
    if (!this.hasAnySuggestions()) {
      this.setStatus('All suggestions dismissed.');
    }
  }

  private hasAnyLocalSuggestion(): boolean {
    return this._localSlots.some(slot => !!slot.suggestion);
  }

  private hasGlobalSuggestion(): boolean {
    return !!this._globalSlot.suggestion;
  }

  private hasAnySuggestions(): boolean {
    return this.hasAnyLocalSuggestion() || this.hasGlobalSuggestion();
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

  private _statusNode!: HTMLDivElement;
  private _pauseButton!: HTMLButtonElement;
  private readonly _localSlots: ISlotState[] = [];
  private _globalSlot!: ISlotState;
}
