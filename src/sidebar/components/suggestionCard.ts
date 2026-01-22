import type {
  IResolvedSuggestion,
  IReadonlyDiffSegment,
  SuggestionContextType
} from '../../types';

const ROOT_CLASS = 'jp-selenepy-suggestedEdits';
const ACTION_BUTTON_CLASS = `${ROOT_CLASS}-actionButton`;
const ITEM_CLASS = `${ROOT_CLASS}-item`;
const ITEM_BODY_CLASS = `${ITEM_CLASS}-body`;
const ITEM_CONTROLS_CLASS = `${ITEM_CLASS}-controls`;
/**
 * Options for building a suggestion card.
 */
export interface ISuggestionCardOptions {
  suggestion: IResolvedSuggestion;
  type: SuggestionContextType;
  localIndex?: number;
  onApply: (suggestion: IResolvedSuggestion) => void;
  onDismiss: (suggestion: IResolvedSuggestion, index?: number) => void;
}

/**
 * Build a suggestion card element.
 */
export function buildSuggestionCard(
  options: ISuggestionCardOptions
): HTMLElement {
  const { suggestion, localIndex, onApply, onDismiss } = options;

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

  // View Toggles
  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'jp-selenepy-view-toggle';

  const previewContainer = document.createElement('div');
  previewContainer.className = 'jp-selenepy-suggestion-preview';

  const updateView = (view: 'original' | 'proposed' | 'diff') => {
    previewContainer.textContent = '';
    toggleContainer.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('jp-mod-active', btn.dataset.view === view);
    });

    if (view === 'original') {
      const pre = document.createElement('pre');
      pre.className = 'jp-selenepy-preview-original';
      pre.textContent = suggestion.originalSource;
      previewContainer.append(pre);
    } else if (view === 'proposed') {
      const pre = document.createElement('pre');
      pre.className = 'jp-selenepy-preview-proposed';
      pre.textContent = suggestion.replacementSource;
      previewContainer.append(pre);
    } else {
      const diffPre = document.createElement('pre');
      renderDiff(diffPre, suggestion.diffSegments);
      previewContainer.append(diffPre);
    }
  };

  const createToggleButton = (
    label: string,
    view: 'original' | 'proposed' | 'diff'
  ) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jp-selenepy-toggle-button';
    btn.textContent = label;
    btn.dataset.view = view;
    btn.addEventListener('click', () => updateView(view));
    return btn;
  };

  const originalBtn = createToggleButton('Original', 'original');
  const proposedBtn = createToggleButton('Proposed', 'proposed');
  const diffBtn = createToggleButton('Diff', 'diff');

  toggleContainer.append(originalBtn, proposedBtn, diffBtn);
  body.append(toggleContainer, previewContainer);

  // Default to Diff view
  updateView('diff');

  const controls = document.createElement('div');
  controls.className = ITEM_CONTROLS_CLASS;

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.textContent = 'Apply';
  applyButton.className = ACTION_BUTTON_CLASS;
  applyButton.addEventListener('click', () => {
    onApply(suggestion);
  });

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.textContent = 'Dismiss';
  dismissButton.className = ACTION_BUTTON_CLASS;
  dismissButton.addEventListener('click', () => {
    onDismiss(suggestion, localIndex);
  });

  controls.append(applyButton, dismissButton);
  item.append(body, controls);

  return item;
}

/**
 * Render diff segments into a container.
 */
function renderDiff(
  container: HTMLElement,
  segments: IReadonlyDiffSegment[]
): void {
  container.textContent = '';
  const table = document.createElement('table');
  table.className = 'jp-selenepy-diff-table';

  for (const segment of segments) {
    const row = document.createElement('tr');
    row.className = `jp-selenepy-diff-row jp-selenepy-diff-row-${segment.type}`;

    const oldLn = document.createElement('td');
    oldLn.className = 'jp-selenepy-diff-ln jp-selenepy-diff-ln-old';
    oldLn.textContent = segment.lineNumberOriginal?.toString() ?? '';

    const newLn = document.createElement('td');
    newLn.className = 'jp-selenepy-diff-ln jp-selenepy-diff-ln-new';
    newLn.textContent = segment.lineNumberNew?.toString() ?? '';

    const gutter = document.createElement('td');
    gutter.className = 'jp-selenepy-diff-gutter';
    gutter.textContent = getGutterSymbol(segment);

    const code = document.createElement('td');
    code.className = 'jp-selenepy-diff-code';
    code.textContent = segment.value;

    row.append(oldLn, newLn, gutter, code);
    table.append(row);
  }
  container.append(table);
}

/**
 * Get the gutter symbol for a segment.
 */
function getGutterSymbol(segment: IReadonlyDiffSegment): string {
  switch (segment.type) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    case 'modified':
      return '~';
    default:
      return ' ';
  }
}
