---

description: "Task list for Per-Item Details Menu & Bulk Selection (005-actions-menu-bulk-select)"
---

# Tasks: Per-Item Details Menu & Bulk Selection

**Input**: Design documents from `/specs/005-actions-menu-bulk-select/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present; no
`contracts/` — this feature adds no API surface)

**Tests**: Included, per plan.md's Testing section — Vitest/Testing Library for the two behaviors
that live entirely in DOM state (menu open/close, checkbox toggling) and Playwright for anything
involving real dialogs, real network calls, or cross-viewport layout (bulk actions, overlap
checks), mirroring 004's split between jsdom-testable and browser-only behavior.

**Organization**: Tasks are grouped by user story (spec.md P1/P2) so each can be implemented and
verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps the task to US1/US2
- Every task names an exact file path

## Path Conventions (extends feature-001–004's layout; see plan.md § Project Structure)

- Frontend: `frontend/src/...`, `frontend/tests/...`
- E2E: `e2e/tests/...`

---

## Phase 1: Setup (Shared Infrastructure)

*No tasks.* This feature adds no new dependency, environment variable, or build configuration —
every change lands in existing files plus one new small component.

---

## Phase 2: Foundational (Blocking Prerequisites)

*No tasks.* The one real cross-story dependency (US2's checkbox slot lands inside the same
restructured card US1 builds) is a genuine part of implementing US1 itself, not a separate
foundation — see User Story Dependencies below for how US2 builds on US1's output.

**Checkpoint**: US1 can start immediately. US2 depends on US1's `FileGrid` restructuring landing
first (T004–T006).

---

## Phase 3: User Story 1 - A compact details menu instead of separate buttons (Priority: P1) 🎯 MVP

**Goal**: Each card shows at most two always-visible controls (Download quick action + a details
trigger) instead of four; opening the details trigger reveals Rename/Move/Delete in a menu that
behaves exactly like today's buttons.

**Independent Test**: Open a folder with several items; confirm each card shows only its
thumbnail, name, a Download quick action, and one details control. Open the details control and
confirm Rename/Move/Delete still work exactly as today.

### Tests for User Story 1

- [X] T001 [P] [US1] Component tests in `frontend/tests/FileGrid.test.tsx` — a card shows exactly
      one details (⋮) trigger and, for files, one Download quick action, and no always-visible
      Rename/Move/Delete buttons; clicking the details trigger opens a menu containing
      Rename/Move/Delete that invoke the same callbacks the old always-visible buttons did;
      clicking outside the open menu, or pressing Escape, closes it with no callback invoked;
      opening a second card's menu closes the first (only one open at a time); with the card now
      a `div[role="button"]`, pressing Enter or Space on it still calls `onOpen` exactly like a
      click, and clicking the details trigger does not also call `onOpen` (event doesn't bubble)
- [X] T002 [P] [US1] Update `e2e/tests/us3-organize.spec.ts`'s existing rename/move/delete
      assertions (`fileCard.getByRole('button', { name: 'Rename' })` etc.) to first open each
      card's details menu (`fileCard.getByRole('button', { name: /Details for/ })`) before
      clicking the action inside it — behavior is unchanged, only how it's reached
- [X] T003 [P] [US1] Create `e2e/tests/actions-menu-bulk-select.spec.ts` with a details-menu
      suite: open/close via outside-click and Escape; opening one card's menu closes another
      already-open one; the menu and Download quick action are available while viewing search
      results (FR-012); at both desktop and a 360px viewport, assert via `boundingBox()` (the
      technique established in `004-ui-polish-viewer`) that the Download quick action and the
      details trigger never overlap each other or any other card element

### Implementation for User Story 1

- [X] T004 [US1] In `frontend/src/components/FileGrid.tsx`, change `.file-card` from
      `<button type="button" onClick={...}>` to `<div role="button" tabIndex={0}
      onClick={...} onKeyDown={...}>`, where the keydown handler calls the same open callback on
      `Enter`/`Space` (matching native `<button>` activation behavior) — per research.md, a real
      `<button>` cannot legally contain the nested details-trigger/checkbox this feature needs
- [X] T005 [US1] In `frontend/src/components/FileGrid.tsx`, add a local `openMenuId: string |
      null` state; render a `<button className="file-card__menu-trigger" aria-label={`Details
      for ${node.name}`}>⋮</button>` (top-right, `stopPropagation` on click) that toggles
      `openMenuId`; when open, render a popover (`.file-card__menu`) as a sibling of `.file-card`
      inside `.file-card-wrapper` (not inside `.file-card` itself, whose `overflow: hidden` would
      clip it — per research.md) containing the Rename/Move/Delete buttons sourced from a new
      `renderMenuActions(node)` prop; close the menu (set `openMenuId` to `null`) on an outside
      click (`window` click listener while open), on `Escape`, and whenever a menu action is
      chosen — depends on T004
- [X] T006 [US1] In `frontend/src/components/FileGrid.tsx`, move the Download quick action out of
      the always-visible action row into the `.file-card__meta` row (files only, beside the size
      text) as a small icon-button, sourced from a new `renderQuickAction(node)` prop; in
      `frontend/src/pages/Browse/index.tsx`, split the existing single `renderActions(node)`
      function into `renderQuickAction(node)` (Download only) and `renderMenuActions(node)`
      (Rename/Move/Delete only), and pass both into `FileGrid` — depends on T004
- [X] T007 [US1] In `frontend/src/pages/Browse/index.tsx`, remove the `searching ? undefined :
      renderActions` guard around the `FileGrid` call so `renderQuickAction`/`renderMenuActions`
      (T006) are always passed, making the details menu and quick action available on search
      results too (FR-012) — depends on T006
- [X] T008 [P] [US1] In `frontend/src/styles/global.css`, add `.file-card__menu-trigger` (top-right
      corner button), `.file-card__menu` (popover anchored to `.file-card-wrapper`, positioned
      below/beside the trigger, following `.upload-list`'s existing sibling-popover pattern from
      `004-ui-polish-viewer`), and a small icon-button style for the Download quick action inside
      `.file-card__meta`

**Checkpoint**: User Story 1 is fully functional and independently testable — cards are
decluttered to two controls, and the details menu's Rename/Move/Delete behave exactly as before.

---

## Phase 4: User Story 2 - Select several items and act on them together (Priority: P2)

**Goal**: A toolbar "Select" mode lets a user check multiple cards and apply bulk Move/Delete to
all of them at once, with per-item partial-failure reporting.

**Independent Test**: In a folder with 3+ items, turn on Select mode, select several, and confirm
bulk Move and bulk Delete apply to all selected items in one step.

### Tests for User Story 2

- [X] T009 [P] [US2] Component tests in `frontend/tests/FileGrid.test.tsx` — when a new
      `selectMode` prop is `true`, each card renders a checkbox reflecting whether its id is in a
      `selectedIds` prop; clicking the card (or pressing Enter/Space on it) calls a new
      `onToggleSelect(id)` prop instead of `onOpen`; while `selectMode` is `true`, the details
      trigger and Download quick action from User Story 1 do not render (per the spec's Edge
      Cases: cards respond to taps by toggling selection, not opening a menu or a preview)
- [X] T010 [P] [US2] Extend `e2e/tests/actions-menu-bulk-select.spec.ts` with a bulk-selection
      suite: the Select toggle is unavailable while a dialog (e.g., "New folder") is open
      (FR-010); turning it on shows a checkbox per card; selecting 3 items shows a bulk-action
      bar with a visible count and Move/Delete actions; bulk Delete shows one confirmation naming
      the count and moves all 3 to Trash; bulk Move opens a folder picker and moves all selected
      items there, rejecting the same cycle case a single move already rejects; a partial-failure
      case (delete one selected item directly via its own details menu first, then run a bulk
      action including it) reports that specific item's failure by name while the rest of the
      batch still succeeds; selection clears when navigating to a different folder, when starting
      a search, and when the Select toggle is turned off; at both desktop and a 360px viewport,
      assert via `boundingBox()` that the Select toggle, per-card checkboxes, and the bulk-action
      bar never overlap card content or each other

### Implementation for User Story 2

- [X] T011 [US2] In `frontend/src/features/nodes/dialogs.tsx`, generalize `MoveDialog`'s prop
      from `node: Node` to `nodes: Node[]`: the title and the folder-picker's self-exclusion
      filter use the full list (reducing to today's exact behavior when the list has one item);
      update `Browse/index.tsx`'s existing single-item `move` dialog to pass `[dialog.node]`
- [X] T012 [US2] In `frontend/src/features/nodes/hooks.ts`, add `useBulkMoveNodes(parentId)` and
      `useBulkTrashNodes(parentId)`: each accepts the selected ids (and, for move, a destination
      id), fires one call per id concurrently via `Promise.allSettled` against the same
      `api.nodes.update`/`api.nodes.trash` calls the existing single-item mutations use, and
      resolves to `{ succeeded: string[]; failed: Array<{ id: string; name: string; message:
      string }> }`; invalidate the same query keys (`['children', parentId]`,
      `['children', destId]` for move, `['trash']` for delete) the single-item hooks already
      invalidate
- [X] T013 [P] [US2] Create `frontend/src/components/BulkResultPanel.tsx`: renders nothing when
      given an empty `failed` list; otherwise renders a small dismissible panel (reusing the
      existing `.card`/`.error-text` classes) listing each failed item's name and message, with a
      "Dismiss" button
- [X] T014 [US2] In `frontend/src/components/FileGrid.tsx`, add `selectMode`, `selectedIds`
      (`Set<string>`), and `onToggleSelect` props: render a checkbox per card (top-left corner,
      opposite the details trigger) when `selectMode` is `true`; route the card's click/Enter/
      Space handler to `onToggleSelect(node.id)` instead of `onOpen` while `selectMode` is `true`;
      suppress the details trigger and Download quick action from User Story 1 while `selectMode`
      is `true` — depends on T004, T005, T006 (the restructured card from User Story 1)
- [X] T015 [US2] In `frontend/src/pages/Browse/index.tsx`: add `selectMode`/`selectedIds` state;
      add a "Select" toggle button to `.toolbar`, disabled while `dialog !== null` (FR-010); when
      `selectMode` is on and `selectedIds.size > 0`, render a bulk-action bar (visible count +
      Move + Delete buttons) that opens new `bulk-move`/`bulk-delete` dialog kinds; wire
      `useBulkMoveNodes`/`useBulkTrashNodes` (T012) to those dialogs — bulk-move reuses the
      generalized `MoveDialog` (T011) with the selected nodes, bulk-delete reuses `ConfirmDialog`
      with a count-aware message; on completion, set a `bulkResult` state (rendered via
      `BulkResultPanel` from T013) if any item failed, and clear `selectedIds`; clear
      `selectedIds` on the existing folder-navigation and search-start code paths; pass
      `selectMode`/`selectedIds`/`onToggleSelect` into `FileGrid` — depends on T011, T012, T013,
      T014
- [X] T016 [P] [US2] In `frontend/src/styles/global.css`, add styles for the Select toggle
      button, the per-card checkbox, the bulk-action bar, and `BulkResultPanel`, ensuring none of
      them overlap the toolbar's existing buttons or card content at a 360px viewport — depends
      on T008 (shares `.file-card-wrapper` as a positioning context)

**Checkpoint**: Both user stories work independently — the details menu (User Story 1) and bulk
selection (User Story 2) are both usable on their own, and together.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation once both stories are complete.

- [X] T017 [P] Run `specs/005-actions-menu-bulk-select/quickstart.md` end-to-end against the
      implemented app at both desktop and 360px widths; fix any drift between the guide and
      actual behavior
- [X] T018 Run the full suite (`npm run test`, `npm run typecheck`, `npm run test:e2e`) and
      resolve any regressions in feature-001–004 behavior
- [X] T019 [US2] Follow-on request: add a "Select all" control (FR-013) to the bulk-action bar in
      `frontend/src/pages/Browse/index.tsx` — toggles between selecting every currently-loaded
      item and deselecting all, based on whether all are already selected; render it whenever
      Select mode is on (not gated on an existing selection, so it's reachable before picking any
      item); E2E coverage added to `e2e/tests/actions-menu-bulk-select.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks
- **Foundational (Phase 2)**: No tasks
- **User Stories (Phase 3–4)**: US1 may start immediately. US2's card-level work (T014) depends
  on US1's `FileGrid` restructuring (T004–T006) landing first; US2's dialog/hook work (T011–T013)
  has no dependency on US1 and can proceed in parallel with US1
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependency on US2
- **US2 (P2)**: T014 (and therefore T015, which depends on T014) needs US1's restructured card
  (T004–T006) already landed; T011–T013 are independent of US1 and can be built in parallel

### Within Each User Story

- Tests are written first and should fail before the matching implementation task lands
- US1: T004 (div restructuring) before T005 (menu, which nests inside the restructured card)
  and before T006 (quick action, same reasoning); T007 depends on T006
- US2: T011, T012, T013 have no dependency on each other; T014 depends on US1's T004–T006; T015
  depends on T011, T012, T013, T014

### Parallel Opportunities

- T001, T002, T003 (US1 tests) in parallel
- T008 (US1 CSS) in parallel with T004–T007 (different concern, same file — land as a separate
  commit to avoid merge noise)
- T009, T010 (US2 tests) in parallel
- T011, T012, T013 (US2's dialog generalization, bulk hooks, and new result panel) in parallel —
  different files, no dependency on each other
- T016 (US2 CSS) in parallel with T011–T015

---

## Parallel Example: User Story 2's independent pieces

```bash
# No dependency on each other or on User Story 1's card restructuring:
Task: "Generalize MoveDialog to nodes: Node[] in frontend/src/features/nodes/dialogs.tsx"      # T011
Task: "Add useBulkMoveNodes/useBulkTrashNodes in frontend/src/features/nodes/hooks.ts"          # T012
Task: "Create BulkResultPanel in frontend/src/components/BulkResultPanel.tsx"                  # T013
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: User Story 1
2. **STOP and VALIDATE**: run T001–T003 — confirm cards are decluttered to two controls and the
   details menu's actions behave exactly as the old buttons did
3. Demo: the core "buttons are useless clutter" complaint is fixed

### Incremental Delivery

1. Add US1 → validate independently → demo (MVP)
2. Add US2 → validate independently → demo bulk select/move/delete
3. Polish → quickstart validation + full-suite regression check

### Parallel Team Strategy

With two developers: one starts US1's card restructuring (T004–T008) while the other builds US2's
independent pieces (T011–T013) in parallel; once US1's restructuring lands, either developer picks
up US2's card-level work (T014–T016), which depends on it.

---

## Notes

- [P] tasks touch different files (or, within `global.css`, different unrelated rule blocks) and
  have no unmet dependency
- [Story] labels map every story-phase task to US1/US2 for traceability
- No tests here are constitution-gating — this feature adds no auth, isolation, or file-access
  surface (see plan.md's Constitution Check) — but they're the only way to verify the spec's
  acceptance scenarios, and the E2E bounding-box checks continue the overlap-verification
  technique `004-ui-polish-viewer` established
- `frontend/src/components/FileGrid.tsx` and `frontend/src/pages/Browse/index.tsx` are touched by
  both stories in sequence (US2 builds on US1's output there) — intentionally not marked `[P]`
  across stories for that reason
- Commit after each task or logical group; stop at either checkpoint to validate a story
  independently

---

## Execution Notes (post-implementation)

- T004–T006 landed as one edit to `FileGrid.tsx` (the div restructuring, the menu trigger/
  popover, and the quick-action move are small enough in this file that splitting them into
  three separate passes would have meant re-reading/re-editing the same ~140-line file three
  times for no benefit).
- A real accessibility bug surfaced only under a real browser's accname algorithm (not jsdom):
  the outer card `div[role="button"]` had no explicit `aria-label`, so its computed accessible
  name aggregated its nested content (the menu trigger's `aria-label` + the filename text),
  making `getByRole('button', { name: 'Details for X' })` ambiguously match both the trigger and
  the card itself in Playwright/Chromium. Fixed by giving the card an explicit
  `aria-label={node.name}`, which also incidentally makes `getByRole` lookups exact instead of
  substring-matched. jsdom's simpler accname implementation never surfaced this, illustrating why
  the plan called for real-browser E2E coverage on top of Vitest for this feature.
- A real state-management gap surfaced only through E2E, not through code review: `selectedIds`
  was cleared inside `openNode`/`navigateCrumb`, but `/` and `/folder/:id` render the *same*
  `Browse` instance (`App.tsx`'s route tree), so navigating via the top-nav "Files" link — which
  bypasses both those functions — left a stale selection behind. Fixed by clearing `selectedIds`
  in a `useEffect` keyed on `fid` instead, which clears on *any* route change regardless of which
  UI path triggered it; the two now-redundant manual clears were removed.
- One E2E test bug (not a product bug) was found and fixed during verification: the bulk-move
  test clicked the folder-picker's inert name `<span>` instead of its "Open" button, so the move
  silently landed at root instead of the intended destination. A second test bug assumed clicking
  a folder card always navigates into it — but per FR-004, while Select mode is on (which,
  correctly, survives navigation — only the selection itself clears), clicking *any* card selects
  it instead, folders included. Fixed by turning Select mode off before re-entering a folder in
  that test.
- All 16 new Playwright tests were run against a real Chromium browser (both `desktop-chromium`
  and `mobile-360` projects) on a production build, against a disposable, isolated SQLite
  database — not just written and left unexecuted. The full pre-existing E2E suite (60 tests
  total across `browse-media`, `us1`–`us4`, this feature's new file) also passed with zero
  regressions once the above fixes landed. One transient failure during that verification
  (`us4-isolation`, a 429) was the login rate-limiter reacting to the volume of manual re-runs in
  this session, not a regression — confirmed by re-running alone once the window cleared.
- T015 (formerly "Run the full suite"): `npm run test` (backend 137/137, frontend 38/38) and
  `npm run typecheck` (both workspaces) are clean.
- A manual visual pass against the built app (screenshots) confirmed the actual interaction the
  user asked for: a tiny ⋮ button in each card's top-right corner opening a Rename/Move/Delete
  menu, and a "Select" toggle that turns every card into a checkbox for bulk Move/Delete.
- T019 (follow-on, "Select all"): a second real E2E-only bug surfaced during verification, this
  time self-inflicted — the test's own seed folder was named `SelectAll_<timestamp>`, which
  substring-matched the "Select"/"Select all" `getByRole` button lookups (Playwright's default
  name matching is substring, not exact), causing spurious "strict mode violation" failures both
  in the new test and, via leftover cross-test data in the shared e2e database, in an unrelated
  already-passing test. Fixed by renaming the fixture folder to avoid the word "Select" entirely
  and switching this test's lookups to `exact: true`. All 18 tests (16 + 2 new) pass on both
  viewports; full 44-test regression suite re-run clean (one more transient 429, same rate-limit
  cause as before, confirmed non-regression by isolated re-run).
