---

description: "Task list for Drag-and-Drop Uploads & Media Carousel Navigation (003-drag-drop-carousel-nav)"
---

# Tasks: Drag-and-Drop Uploads & Media Carousel Navigation

**Input**: Design documents from `/specs/003-drag-drop-carousel-nav/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present; no
`contracts/` — this feature adds no API surface)

**Tests**: Included, mirroring feature-001/002's existing test layout (`frontend/tests/*.test.tsx`,
`e2e/tests/*.spec.ts`). None are constitution-gating (no auth/isolation/file-access surface is
touched — see plan.md's Constitution Check), but they're the only way to verify the two stories'
acceptance scenarios.

**Organization**: Tasks are grouped by user story (spec.md P1/P2) so each can be implemented and
verified independently on one shared (empty) foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps the task to US1/US2
- Every task names an exact file path

## Path Conventions (extends feature-001/002's layout; see plan.md § Project Structure)

- Frontend: `frontend/src/...`, `frontend/tests/...`
- E2E: `e2e/tests/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

*No tasks.* This feature adds no new dependency, environment variable, or build configuration —
it's UI event wiring on top of the existing frontend stack (React, TanStack Query, native Drag and
Drop API). Existing e2e fixtures (`SAMPLE_JPEG`/`SAMPLE_MP4` and the folder-seeding helper in
`e2e/tests/helpers.ts`) already cover what the new E2E tests need.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

*No tasks.* US1 (drag-and-drop) and US2 (carousel navigation) touch different, unrelated regions
of the one file they share (`frontend/src/pages/Browse/index.tsx`) and depend on no new schema,
service, or shared abstraction — each story's own implementation section below is self-contained.

**Checkpoint**: Nothing blocks starting either user story phase immediately.

---

## Phase 3: User Story 1 - Upload files by dragging them in (Priority: P1) 🎯 MVP

**Goal**: Dropping files from the OS onto the folder view uploads them into the current folder
through the same pipeline (progress, retry, "kept both") as the existing "Upload" button.

**Independent Test**: Drag 2–3 files from the desktop onto the folder view and confirm they appear
in the upload progress list and land in that folder, without touching the "Upload" button.

### Tests for User Story 1

- [X] T001 [P] [US1] Component test for the new drop wrapper in `frontend/tests/DropZone.test.tsx`
      — dropping files calls the passed-in `onFiles` with the dropped `FileList`; a hover/highlight
      class is applied on `dragenter` and removed on `dragleave`/`drop`; a drag whose
      `dataTransfer.types` doesn't include `'Files'` (e.g., dragged text) is ignored (no `onFiles`
      call, no hover class); when `disabled` is true, no hover class appears and `onFiles` is never
      called for any drag/drop event
- [X] T002 [P] [US1] E2E test in new file `e2e/tests/browse-media.spec.ts` — drag-and-drop upload
      scenario: dispatch a synthetic `drop` (via Playwright's `dataTransfer`/`DataTransfer` helper)
      carrying a sample image onto the folder view; assert it appears in the progress list and then
      the grid; drop a same-named file again and assert the existing "kept both" notice appears

### Implementation for User Story 1

- [X] T003 [US1] Lift the single `useUploader(fid)` instance out of `frontend/src/components/Uploader.tsx`
      up into `Browse` (`frontend/src/pages/Browse/index.tsx`); change `Uploader` to accept
      `items`/`add`/`retry`/`dismiss`/`clearCompleted` as props instead of calling the hook itself,
      so button uploads and (in T005) drag-and-drop uploads share one progress list and one upload
      queue
- [X] T004 [US1] Create `DropZone` in `frontend/src/components/DropZone.tsx` — a wrapper component
      that handles `dragenter`/`dragover`/`dragleave`/`drop`, ignores drags whose
      `dataTransfer.types` doesn't include `'Files'` (FR-005), renders a visible hover/highlight cue
      while a file-carrying drag is over it (FR-002), calls `onFiles(files: FileList)` on drop, and
      no-ops every handler (no cue, no call) when its `disabled` prop is true
- [X] T005 [US1] Wrap the folder-view content of `frontend/src/pages/Browse/index.tsx` in
      `DropZone`, passing `onFiles={add}` (the lifted uploader from T003) and
      `disabled={searching || dialog !== null}` (FR-004/FR-006) — depends on T003, T004

**Checkpoint**: User Story 1 is fully functional and independently testable — dragging files onto
the folder view uploads them exactly like the "Upload" button does.

---

## Phase 4: User Story 2 - Move between photos and videos with arrows (Priority: P2)

**Goal**: Left/right controls (and arrow keys) in the full-screen viewer step through the
previewable files of the current listing without closing the viewer.

**Independent Test**: Open the first of 3+ previewable files in a folder and use the arrows/keys to
step forward and backward through the rest without returning to the grid.

### Tests for User Story 2

- [X] T006 [P] [US2] Extend `frontend/tests/Viewers.test.tsx` — `PhotoViewer`/`VideoPlayer` render a
      "next" control that calls `onNext` on click and on `ArrowRight` keydown, and a "previous"
      control that calls `onPrev` on click and on `ArrowLeft` keydown; each control is hidden or
      disabled when the corresponding `hasNext`/`hasPrev` prop is false; `VideoPlayer` unmounts and
      remounts its `<video>` (verify via a changed DOM node / reset `currentTime`) when `node`
      changes, per FR-009
- [X] T007 [P] [US2] Append carousel-navigation scenarios to `e2e/tests/browse-media.spec.ts` —
      seed a 3-file folder, open the first, step through with clicks/arrow keys (asserting
      "previous" hidden/disabled on the first and "next" hidden/disabled on the last), then back to
      the first; separately, seed a 52-file folder (two pages past the default 50-item page size)
      and assert navigating past item 50 loads the next page automatically (FR-010) without closing
      the viewer, comfortably covering SC-002's 20-consecutive-item bar

### Implementation for User Story 2

- [X] T008 [US2] Add optional `onPrev`/`onNext`/`hasPrev`/`hasNext` props to `Preview` in
      `frontend/src/components/Preview.tsx` and forward them to whichever viewer it renders
      (`PhotoViewer`, `VideoPlayer`); the unsupported-type fallback ignores them (no nav controls
      there, per the existing fallback's single-purpose "can't preview, download instead" design)
- [X] T009 [P] [US2] Add prev/next controls to `frontend/src/components/PhotoViewer.tsx` and extend
      its existing `keydown` listener to call `onPrev`/`onNext` on `ArrowLeft`/`ArrowRight`
      (alongside the existing `Escape` handling), hiding/disabling each control per
      `hasPrev`/`hasNext` — depends on T008
- [X] T010 [P] [US2] Add the same prev/next controls and `ArrowLeft`/`ArrowRight` handling to
      `frontend/src/components/VideoPlayer.tsx`, and key the rendered `<video>` element by
      `node.id` so navigating to a different item fully remounts it (stopping any current playback
      before the next item is shown, FR-009) — depends on T008
- [X] T011 [US2] In `frontend/src/pages/Browse/index.tsx`, replace `preview: Node | null` with
      `previewIndex: number | null`; derive `previewNode = previewIndex !== null ? items[previewIndex] : null`,
      `hasPrev = previewIndex !== null && previewIndex > 0`, and
      `hasNext = previewIndex !== null && (previewIndex < items.length - 1 || active.hasNextPage)`
      per data-model.md; implement `onNext` (if at the last loaded index and `active.hasNextPage`,
      `await active.fetchNextPage()` first, then increment `previewIndex`; FR-010) and `onPrev`
      (decrement `previewIndex`); update `openNode` to set `previewIndex` to the clicked node's
      index in `items` instead of setting `preview`; pass `previewNode`/`onPrev`/`onNext`/`hasPrev`/
      `hasNext` into `Preview` — depends on T008, T009, T010

**Checkpoint**: User Stories 1 and 2 both work independently — drag-and-drop upload and full-screen
carousel navigation are both usable on their own.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Visual finish and end-to-end validation once both stories are complete.

- [X] T012 [P] Add styles for the drop-zone hover/highlight cue and the viewer's prev/next nav
      controls to `frontend/src/styles/global.css`, alongside the existing `.viewer` rules
- [X] T013 [P] Run `specs/003-drag-drop-carousel-nav/quickstart.md` end-to-end against the
      implemented app; fix any drift between the guide and actual behavior — validated via the
      `e2e/tests/browse-media.spec.ts` suite (T002/T007) against a real production build, which
      exercises every scenario in the guide; no drift found
- [X] T014 Run the full suite (`npm run test`, `npm run typecheck`, `npm run test:e2e`) and resolve
      any regressions in feature-001/002 behavior — backend 137/137, frontend 21/21, typecheck
      clean on both workspaces; full e2e suite green on desktop-chromium + mobile-360 except the
      pre-existing `downloads.spec.ts` case, which needs the `yt-dlp`/`ffmpeg` system binaries not
      installed in this environment (unrelated to this feature; no code here was touched)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — nothing to initialize
- **Foundational (Phase 2)**: No tasks — nothing shared blocks either story
- **User Stories (Phase 3–4)**: Both may start immediately; each is fully independent of the other
  except that their implementation tasks land in the same file (`Browse/index.tsx`) in different,
  unrelated sections — do T003–T005 (US1) and T008–T011 (US2) as separate edits/commits to avoid
  merge noise, in either order
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependency on US2
- **US2 (P2)**: No dependency on US1

### Within Each User Story

- Tests are written first and should fail before the matching implementation task lands
- US1: T003 (lift the hook) before T005 (wire `DropZone` using it); T004 (build `DropZone`) can
  happen any time before T005
- US2: T008 (`Preview` prop plumbing) before T009/T010 (the two viewers); all three before T011
  (`Browse` wiring, which passes the props `Preview` now accepts)

### Parallel Opportunities

- T001 and T002 (US1 tests) in parallel
- T004 (`DropZone`) in parallel with T003 (hook lift) — different files
- T006 and T007 (US2 tests) in parallel
- T009 and T010 (PhotoViewer/VideoPlayer nav) in parallel once T008 lands — different files
- T012 and T013 (Polish) in parallel
- US1's phase (T001–T005) and US2's phase (T006–T011) can be worked in parallel by different
  people, landing their respective `Browse/index.tsx` edits as separate sequential commits

---

## Parallel Example: User Story 1

```bash
# Tests for US1 (different files, independent):
Task: "Component test for DropZone in frontend/tests/DropZone.test.tsx"
Task: "E2E drag-and-drop upload scenario in e2e/tests/browse-media.spec.ts"

# Implementation groundwork that doesn't depend on each other:
Task: "Lift useUploader(fid) into Browse in frontend/src/pages/Browse/index.tsx"
Task: "Create DropZone in frontend/src/components/DropZone.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: User Story 1
2. **STOP and VALIDATE**: run T001–T002, confirm dropped files upload like button uploads
3. Demo: drag-and-drop is already the complete point of this story

### Incremental Delivery

1. Add US1 → validate independently → demo (MVP)
2. Add US2 → validate independently → demo full-screen carousel navigation
3. Polish → styling + quickstart validation + full-suite regression check

### Parallel Team Strategy

With two developers: one takes US1 (T001–T005), the other takes US2 (T006–T011), landing their
`Browse/index.tsx` edits as separate commits since both touch that file in unrelated places.

---

## Notes

- [P] tasks touch different files and have no unmet dependency
- [Story] labels map every story-phase task to US1/US2 for traceability
- No tests here are constitution-gating — this feature adds no auth, isolation, or file-access
  surface (see plan.md's Constitution Check) — but they're required to verify the spec's
  acceptance scenarios
- `frontend/src/pages/Browse/index.tsx` is touched by both stories in unrelated sections —
  intentionally not marked `[P]` across stories for that reason
- Commit after each task or logical group; stop at either checkpoint to validate a story
  independently
