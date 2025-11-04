# Suggested Edits Sidebar Plan

## Goals
- Surface LLM-powered edit suggestions for the active notebook, contextualized by its outline and content.
- Provide an interactive sidebar that lets users review, tweak, and apply suggested edits to notebook cells.
- Maintain clear separation between frontend UI, backend scheduling, and LLM orchestration to keep the extension maintainable.

## Assumptions to Validate
- LLM access will be available via an HTTP endpoint (confirm auth, rate limits, and response schema).
- Notebook outline info can be sourced via the `INotebookTracker` model or equivalent API; confirm best practice in JupyterLab docs.
- Real-time scanning frequency will be constrained to avoid performance issues; clarify acceptable debounce/interval.
- Applying edits should leverage notebook model APIs to preserve undo history.

## Key Workstreams
### 1. Requirements Discovery
- Review JupyterLab extension developer guide for sidebar patterns (command palette registration, layout restorer).
- Explore extension examples for side panels with live updates (refs: inspector, AI assist repos).
- Decide whether suggestions trigger automatically or on user command; document UX expectations with the user.

### 2. Data Gathering Layer
- Track the active notebook via `INotebookTracker` and subscribe to content/selection changes.
- Extract notebook outline: parse headings from Markdown cells or leverage built-in outline service if available.
- Normalize notebook state into a summary payload for the LLM request (titles, current cell, recent history).
- Implement throttling/debouncing for re-computation to avoid excessive requests.

### 3. Backend & LLM Orchestration
- Define Python route(s) in `selenepy/routes.py` to accept notebook context, call the LLM, and return structured suggestions.
- Introduce a typed response contract (e.g., `suggestions: Array<{title, description, patch}>`).
- Handle error cases (timeouts, auth issues) and surface user-facing notifications when calls fail.
- Evaluate caching strategy for repeated contexts to reduce cost/latency.

### 4. Frontend Sidebar UI
- Create a new `SuggestedEditsSidebar` widget extending `SidePanel` (or `Widget`) with namespace classes in `style/index.css`.
- Render suggestion cards with actions: preview diff, apply, dismiss, regenerate.
- Provide status indicators (loading, last updated, error) and manual refresh control.
- Use lumino signals to react to backend responses and notebook state changes.

### 5. Edit Application Flow
- For preview: show diff view (consider `NotebookDiffModel` patterns or custom renderer).
- For apply: integrate with notebook commands to replace cell content or insert new cells while respecting undo/redo.
- Confirm whether multi-cell changes are atomic; consider using transactions if API supports them.

### 6. Telemetry & Logging
- Log backend errors with `console.error`; surface user notifications via `showErrorMessage` or similar utilities.
- Optionally, collect anonymized metrics (subject to user approval) for feature usage.

### 7. Configuration & Settings
- Define schema entries in `schema/plugin.json` for:
  - Auto-refresh interval / debounce window.
  - Toggle for automatic vs manual suggestion generation.
  - LLM endpoint URL and auth token reference (ensure secure storage guidance).
- Provide settings editor defaults and documentation updates in `README.md`.

### 8. Testing Strategy
- Frontend: add Jest tests for API utilities and UI state reducers.
- Backend: extend `selenepy/tests/test_routes.py` with mocked LLM calls.
- Integration: consider Playwright UI test to verify sidebar presence and apply flow.

### 9. Tooling & Workflow
- Update `package.json` scripts if new build steps or lint rules are needed.
- Ensure `jlpm run watch` workflow covers new files; document developer steps in `README.md`.
- Plan for running `npx tsc --noEmit` and Python `py_compile` checks after implementation.

### 10. Documentation Deliverables
- Update README with feature overview, configuration, and usage instructions.
- Add changelog entry summarizing new sidebar feature once implemented.

## Risks & Open Questions
- How to manage large notebook contexts within LLM token limits; may require summarization.
- Need clarity on user privacy/compliance considerations for sending notebook data to LLM.
- Determine fallback behavior when offline or endpoint unreachable (e.g., cached suggestions, user messaging).
- Define performance budgets for scanning frequency and sidebar rendering.

## Slot-Based Suggestion Architecture (Nov 4, 2025)

### Overview
- Sidebar displays up to **three persistent slots**:
  1. `Local Slot A` – most recent local-context suggestion (current cell ± neighbors).
  2. `Local Slot B` – previous local-context suggestion (shifted down when a new local suggestion arrives).
  3. `Global Slot` – most recent global-context suggestion generated from a manual full scan.
- Local slots update automatically on notebook activity (subject to debounce). Global slot updates only when the user clicks **Refresh (full)**.

### Frontend Responsibilities
- Extend `SuggestedEditsSidebar` to manage structured slots instead of an append-only list:
  - Maintain an internal state `{ local: [slotA, slotB], global: slot }`.
  - Render two sections: **Local Context Suggestions** (with two cards) and **Global Notebook Suggestion** (with header + single card).
  - Provide methods like `updateLocalSuggestion(suggestion)` and `updateGlobalSuggestion(suggestion)` that update DOM nodes in place, hiding sections when empty.
  - When `updateLocalSuggestion` is called, shift `slotA → slotB`, store new suggestion in `slotA`, and re-render both entries.
- Preserve apply/dismiss interactions per slot; dismissing a local card should reveal the older suggestion if present.

### Controller Responsibilities
- Annotate streamed suggestions with `contextType: 'local' | 'global'` (ensure backend carries this flag).
- Update `processStreamEvent` in `suggestedEditsController` to route payloads:
  - If `contextType === 'local'`, call `panel.updateLocalSuggestion()`.
  - If `contextType === 'global'`, call `panel.updateGlobalSuggestion()`.
- Automatic refresh (`autoRefresh`) schedules only `refresh('context')`. Cancel timers when auto-refresh disabled.
- Manual buttons:
  - **Refresh (context)** triggers `refresh('context')` immediately.
  - **Refresh (full)** triggers `refresh('full')`, updating global slot.
- Persist latest snapshot per mode so follow-up actions (apply/diff) remain valid.

### Backend Adjustments
- Ensure streaming responses include `contextType` for each suggestion:
  - Contextual scans (`mode=context`) emit `contextType='local'`.
  - Full scans (`mode=full`) emit `contextType='global'`.
- Optionally include timestamp metadata so UI can display “Last global update at …”.

### Types & Validation
- Extend shared TypeScript types (`ISuggestion`, `IResolvedSuggestion`) and corresponding Pydantic models with optional `contextType: Literal['local', 'global']`.
- Update normalization utilities to default to `'local'` when missing, ensuring backward compatibility.

### UX & Copy Updates
- Local section label: “Local Context Suggestions (auto updates)”.
- Global section label: “Global Notebook Suggestion (manual refresh)”.
- When global slot is empty, show helper text prompting user to run a full scan.

### CSS Adjustments
- Provide clear visual separation between local and global sections (headers, spacing, optional border).
- Ensure cards remain responsive with existing padding/wrapping rules.

### Testing Checklist
- Unit tests for panel slot logic: FIFO shifting, clearing, apply/dismiss behavior.
- Controller tests verifying auto-refresh only requests context suggestions, manual full refresh updates global slot.
- Backend tests asserting `contextType` flag is set per mode and schema validation still passes.

### Open Questions
- Should global slot persist across notebook switches or reset per notebook? (Default: reset.)
- Do we need to surface when global suggestion is “stale” (e.g., older than N minutes)?
