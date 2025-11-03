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
