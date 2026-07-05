# Phase 0 Research: Drag-and-Drop Uploads & Media Carousel Navigation

No `[NEEDS CLARIFICATION]` markers remained in the spec or plan's Technical Context, so this phase
records the decisions behind the plan's approach rather than resolving open unknowns.

## Decision: Reuse `useUploader().add()` as the single upload entry point

- **Decision**: Drag-and-drop calls the exact same `add(files: FileList | File[])` function the
  "Upload" button already uses, via a new `DropZone` wrapper component that only translates
  `drop` events into that call.
- **Rationale**: `add()` already accepts a `FileList` (what `event.dataTransfer.files` provides)
  and already implements per-file progress, retry, and "kept both" collision handling
  (`frontend/src/features/upload/hooks.ts`). Duplicating any of that for drag-and-drop would
  create two upload code paths that could drift, violating the simplicity mandate.
- **Alternatives considered**: A separate drag-and-drop upload hook — rejected, pure duplication
  for no behavioral difference; a library like `react-dropzone` — rejected, the native Drag and
  Drop API is sufficient for "accept dropped files, show a hover cue," and adding a dependency
  isn't justified by that scope.

## Decision: Gate the drop zone the same way the button is gated

- **Decision**: The drop handler is a no-op (and shows no hover cue) while `searching` is true or
  a `dialog` is open, mirroring `Browse`'s existing `{!searching && <Uploader .../>}` guard.
- **Rationale**: Keeps one gating rule instead of two; avoids uploads "underneath" a modal or into
  an ambiguous "search results" target (FR-004/FR-006).
- **Alternatives considered**: Allowing drops during search and uploading into the *current
  folder* regardless — rejected as surprising, since nothing in the search view indicates which
  folder that would be.

## Decision: Navigation state lives in `Browse`, indexed into the existing `items` array

- **Decision**: `Browse` already computes `items: Node[]` from `useChildren`/`useSearch`. Add a
  `previewIndex: number | null` alongside the existing `preview: Node | null` (or replace it),
  compute `hasPrev`/`hasNext` from the index bounds and `active.hasNextPage`, and call
  `active.fetchNextPage()` transparently when the user arrows past the last loaded index.
- **Rationale**: `items` already reflects the exact on-screen order (folders first, then name —
  `backend/src/modules/nodes/repository.ts` `ORDER BY type DESC, name ASC, id ASC`) that the user
  sees in the grid, so "next/previous" in the viewer matches "next/previous" visually in the grid
  with no separate ordering logic to keep in sync.
- **Alternatives considered**: Fetching a fresh "siblings" list from a new endpoint — rejected,
  redundant with data `Browse` already has loaded and would add a server surface for a purely
  client-side navigation concern; storing the index inside `Preview`/`PhotoViewer` instead of
  `Browse` — rejected, those components don't have access to the full `items` array or pagination
  controls today, and threading that down is simpler than lifting upload/dialog-adjacent state.

## Decision: Extend the existing per-viewer Escape-key listener rather than adding a new global one

- **Decision**: `PhotoViewer` and `VideoPlayer` each already register a `keydown` listener for
  Escape; add `ArrowLeft`/`ArrowRight` handling to that same listener (calling the passed-in
  `onPrev`/`onNext`), guarded by `hasPrev`/`hasNext`.
- **Rationale**: One listener per open viewer, symmetrical with existing Escape handling; avoids a
  new keyboard-shortcut layer or focus-trap consideration since the viewer is already the only
  modal-like surface capturing keydown when open (spec Edge Cases: arrow keys and other dialogs
  are never shown simultaneously).
- **Alternatives considered**: A shared `useCarouselKeys` hook — considered, but with the logic
  being ~3 lines per component and only two call sites, an extraction isn't justified yet.

## Decision: Video playback stops before the next item mounts

- **Decision**: On navigate, `VideoPlayer` unmounts/remounts (new `key={node.id}`) rather than
  swapping the `src` of a persistent `<video>` element.
- **Rationale**: Guarantees playback fully stops and state (currentTime, playing) resets per
  FR-009/Acceptance Scenario 6, using React's existing remount-on-key-change behavior instead of
  manual `pause()`/`load()` orchestration.
- **Alternatives considered**: Manually calling `.pause()` and setting `.currentTime = 0` on the
  existing element before swapping `src` — rejected as more imperative code for the same outcome
  React's key-based remount already gives for free.
