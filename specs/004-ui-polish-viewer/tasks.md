---

description: "Task list for UI Layout Polish & Viewer Enhancement (004-ui-polish-viewer)"
---

# Tasks: UI Layout Polish & Viewer Enhancement

**Input**: Design documents from `/specs/004-ui-polish-viewer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present; no
`contracts/` — this feature adds no API surface)

**Tests**: Included where they can actually catch the regression. The core defects here
(overlap, cramped spacing) are real-browser *layout* bugs — Vitest/jsdom does not compute layout,
so it cannot see them; the tests that matter are Playwright bounding-box assertions
(`e2e/tests/browse-media.spec.ts`), the same technique used to find and verify every fix in
`research.md`. Vitest component tests are added only for the one piece of genuinely DOM-testable
new behavior (the position-in-set label). None of this is constitution-gating (no auth/isolation/
file-access surface is touched — see plan.md's Constitution Check).

**Organization**: Tasks are grouped by user story (spec.md P1/P2) so each can be implemented and
verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps the task to US1/US2/US3/US4
- Every task names an exact file path

## Path Conventions (extends feature-001/002/003's layout; see plan.md § Project Structure)

- Frontend: `frontend/src/...`, `frontend/tests/...`
- E2E: `e2e/tests/...`

---

## Phase 1: Setup (Shared Infrastructure)

*No tasks.* This feature adds no new dependency, environment variable, or build configuration —
every fix lands in existing files (`global.css`, existing components). Existing e2e fixtures
(`SAMPLE_JPEG`/`SAMPLE_MP4`, `seedSampleMedia`, `uiLogin` in `e2e/tests/helpers.ts`) already cover
what the new tests need; long-named fixtures are created inline in each test via the same upload
helpers.

---

## Phase 2: Foundational (Blocking Prerequisites)

*No tasks.* US1–US4 touch different, mostly-unrelated rule blocks in the one file several of
them share (`frontend/src/styles/global.css`) — see the one real cross-story dependency called
out explicitly under US4 below (T009 extends the same CSS selector T004 introduces).

**Checkpoint**: Nothing blocks starting US1, US2, or US3 immediately. US4's CSS task (T009)
depends on US2's (T004); its other tasks do not.

---

## Phase 3: User Story 1 - No overlapping elements while browsing files (Priority: P1) 🎯 MVP

**Goal**: File/folder cards in the browse grid and search results never visually overlap a
neighboring card or its action buttons, regardless of name length or screen width.

**Independent Test**: Place a long/unbroken-name file alongside several others in one folder;
view it at desktop and 360px widths and confirm no card's thumbnail, name, or action buttons
cover a neighboring card's.

### Tests for User Story 1

- [X] T001 [P] [US1] E2E test in `e2e/tests/browse-media.spec.ts` — seed a folder with 3+ files
      via the API, including one with a 40+ character name with no spaces (mirroring a pasted
      web-page title); at both desktop width and a 360px viewport, read every `.file-card-wrapper`
      and its child `.file-card`'s `boundingBox()` and assert (a) no two wrappers' rectangles
      intersect and (b) each `.file-card`'s width never exceeds its own wrapper's width (the
      exact regression measured in research.md, where two cards measured 783px/439px wide inside
      a 157px wrapper)

### Implementation for User Story 1

- [X] T002 [US1] In `frontend/src/styles/global.css`, add a `.file-card-wrapper { min-width: 0;
      }` rule (currently has no rule at all) and add `width: 100%; min-width: 0;` to the existing
      `.file-card` rule — the verified fix from research.md's "file-grid overlap" finding; no
      markup change needed in `frontend/src/components/FileGrid.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable — long names no
longer make a card overlap its neighbor, at any tested width.

---

## Phase 4: User Story 2 - Full-screen viewer controls never cover the media (Priority: P1) 🎯 MVP

**Goal**: The close button, filename, and previous/next controls in the full-screen photo/video
viewer always render in the space around the media, never on top of it; the backdrop fully hides
the page behind it.

**Independent Test**: Open a photo/video sized to fill most of the viewport width at 360px, with
a next item available, and confirm the previous/next buttons never sit on top of the image/video.

### Tests for User Story 2

- [X] T003 [P] [US2] Extend `e2e/tests/browse-media.spec.ts` — seed a folder with 3+ previewable
      items (mix of the long-named file from T001 and `SAMPLE_JPEG`/`SAMPLE_MP4`); open the first
      item at a 360px viewport and assert via `boundingBox()` that `.viewer__nav--prev` and
      `.viewer__nav--next` never intersect `.viewer__content img`/`.viewer__content video`; open
      the long-named item and assert `.viewer__bar` never intersects `.viewer__close`; assert the
      computed backdrop color's alpha channel on `.viewer` is ≥ 0.98

### Implementation for User Story 2

- [X] T004 [US2] In `frontend/src/styles/global.css`: raise `.viewer`'s backdrop from
      `rgba(0, 0, 0, 0.92)` to `rgba(0, 0, 0, 0.98)` (stop the page behind it from bleeding
      through, per research.md); replace `.viewer__content img, .viewer__content video`'s plain
      `max-width: 96vw; max-height: 86vh;` with a gutter-aware pair (e.g. `max-width: min(96vw,
      calc(100vw - 112px)); max-height: 86vh;`) sized so the reserved side gutters are wider than
      `.viewer__nav`'s own footprint (40px button + 12px offset + spacing), guaranteeing the nav
      buttons always land in empty space beside the media instead of on top of it

**Checkpoint**: User Stories 1 and 2 both work independently — grid overlap and viewer-control
overlap are both fixed on their own.

---

## Phase 5: User Story 3 - A tidier, more compact layout (Priority: P2)

**Goal**: The upload-progress list shows each file's name, status, and remove control with clear
visible separation instead of running together as merged text.

**Independent Test**: Upload 2+ files, including one with a long name, and confirm each row
clearly separates name/status/remove with visible spacing.

### Tests for User Story 3

- [X] T005 [P] [US3] Extend `frontend/tests/uploader.test.tsx` with an E2E-style check moved into
      `e2e/tests/browse-media.spec.ts` instead (jsdom cannot compute layout/spacing) — upload two
      files including one long-named one, wait for rows to render, and assert via `boundingBox()`
      that `.upload-row__name`, its adjacent status text, and the dismiss button each have a
      positive horizontal gap between their rectangles (no touching, let alone overlap) at both
      desktop and 360px widths — the exact regression measured in research.md
      (`"long-name-file-1.txtDone"` rendering as one run of text)

### Implementation for User Story 3

- [X] T006 [US3] In `frontend/src/styles/global.css`, add rules for the four currently-undefined
      classes used by `frontend/src/components/Uploader.tsx`: `.uploader { position: relative;
      }`; `.upload-list` (extend the existing `card` styling it already carries) as a floating
      panel — `position: absolute; top: calc(100% + 8px); right: 0; width: min(360px, 90vw);
      max-height: 60vh; overflow-y: auto; z-index: 20;` — so it no longer competes with "New
      folder"/"Download from web" for space in `.toolbar`'s flex row; `.upload-row { display:
      flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 0; }` (mirroring
      `.list-row`'s existing flex+wrap pattern); `.upload-row__name { flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`

**Checkpoint**: User Stories 1–3 all work independently.

---

## Phase 6: User Story 4 - A more polished, watchable video viewer (Priority: P2)

**Goal**: Small-resolution media scales up to a comfortable viewing size, the viewer shows the
item's position within its set, and — as a side effect of US2's gutter fix — the title bar never
sits over the frame.

**Independent Test**: Open a small-resolution video within a multi-item folder; confirm it
displays larger than its native size and a "n of total" indicator is visible and updates when
navigating.

### Tests for User Story 4

- [X] T007 [P] [US4] Extend `frontend/tests/Viewers.test.tsx` — `PhotoViewer`, `VideoPlayer`, and
      `Preview` accept an optional `position?: { index: number; total: number }` prop; when
      provided, a text label containing e.g. "2 of 3" renders in the existing top-bar area; when
      omitted (or `total <= 1`), no such label renders
- [X] T008 [P] [US4] Extend `e2e/tests/browse-media.spec.ts` — open `SAMPLE_MP4` (undecodable
      fixture, so it renders at the browser's default replaced-element size absent real
      metadata) from within the 3+ item folder used in T003 and assert via `boundingBox()` that
      the rendered `<video>` element's width is meaningfully larger than the browser's ~300px
      no-metadata default (i.e., the min-size CSS from T009 is taking effect); assert a "2 of 3"
      -style position label is visible and updates to "3 of 3" after clicking "Next"

### Implementation for User Story 4

- [X] T009 [US4] In `frontend/src/styles/global.css`, extend the `.viewer__content img,
      .viewer__content video` rule from T004 with `min-width: min(480px, calc(100vw - 112px));`
      (same gutter-adjusted ceiling T004 established, now also acting as a floor) so small media
      scales up to a comfortable size while `height: auto`'s existing aspect-ratio preservation
      and the existing `max-height` still cap large media exactly as before — depends on T004
      (same selector)
- [X] T010 [US4] Add `position?: { index: number; total: number }` to `PreviewNavProps` in
      `frontend/src/components/Preview.tsx` and forward it to `PhotoViewer`/`VideoPlayer`; the
      unsupported-type download fallback ignores it (no set to show a position within)
- [X] T011 [P] [US4] Render the "n of total" label in `frontend/src/components/PhotoViewer.tsx`'s
      existing `.viewer__bar` area when `position` is provided — depends on T010
- [X] T012 [P] [US4] Same in `frontend/src/components/VideoPlayer.tsx` — depends on T010
- [X] T013 [US4] In `frontend/src/pages/Browse/index.tsx`, compute `position` per data-model.md —
      `previewIndex !== null && items.length > 1 ? { index: previewIndex + 1, total: items.length
      } : undefined` — and pass it into `Preview` alongside the existing `onPrev`/`onNext`/
      `hasPrev`/`hasNext` props — depends on T010, T011, T012

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation once all four stories are complete.

- [X] T014 [P] Run `specs/004-ui-polish-viewer/quickstart.md` end-to-end against the implemented
      app at both desktop and 360px widths; fix any drift between the guide and actual behavior
- [X] T015 Run the full suite (`npm run test`, `npm run typecheck`, `npm run test:e2e`) and
      resolve any regressions in feature-001/002/003 behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks
- **Foundational (Phase 2)**: No tasks
- **User Stories (Phase 3–6)**: US1–US3 may start immediately and in any order; US4's CSS task
  (T009) depends on US2's (T004) since both edit the same selector — everything else in US4 is
  independent of US1–US3
- **Polish (Phase 7)**: Depends on all four stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories
- **US2 (P1)**: No dependency on other stories
- **US3 (P2)**: No dependency on other stories
- **US4 (P2)**: T009 depends on US2's T004 (same CSS selector); T010–T013 have no dependency on
  US1–US3

### Within Each User Story

- Tests are written first and should fail before the matching implementation task lands
- US4: T010 (prop plumbing) before T011/T012 (the two viewers); all three before T013 (`Browse`
  wiring, which passes the prop `Preview` now accepts)

### Parallel Opportunities

- T001, T003, T005, T007, T008 (all test-writing tasks) can be drafted in parallel — different
  `describe` blocks/files
- T002 (US1), T006 (US3) can happen in parallel with each other — unrelated CSS rules
- T011 and T012 (US4 viewer labels) in parallel once T010 lands — different files
- T014 (Polish) can start as soon as all story tasks land; T015 last

---

## Parallel Example: User Stories 1–3

```bash
# Independent CSS fixes (different rule blocks, same file — land as separate commits):
Task: "Fix .file-card / .file-card-wrapper sizing in frontend/src/styles/global.css"          # T002
Task: "Raise .viewer backdrop opacity + gutter-constrain media in frontend/src/styles/global.css"  # T004
Task: "Add .uploader/.upload-list/.upload-row(__name) rules in frontend/src/styles/global.css"     # T006
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 — both P1)

1. Complete Phase 3: User Story 1 (grid overlap)
2. Complete Phase 4: User Story 2 (viewer-control overlap)
3. **STOP and VALIDATE**: run T001, T003 — confirm the two literal overlap bugs are gone at
   desktop and 360px
4. Demo: both reported "objects overlap" defects are fixed

### Incremental Delivery

1. Add US1 → validate independently → demo
2. Add US2 → validate independently → demo (MVP complete: both P1 overlap fixes shipped)
3. Add US3 → validate independently → demo tidier upload list
4. Add US4 → validate independently → demo scaled-up video + position indicator
5. Polish → quickstart validation + full-suite regression check

### Parallel Team Strategy

With multiple developers: one takes US1 (T001–T002), another takes US2 (T003–T004), a third takes
US3 (T005–T006); US4 (T007–T013) starts once US2's T004 lands, since T009 extends that same rule.

---

## Notes

- [P] tasks touch different files (or, within `global.css`, different unrelated rule blocks) and
  have no unmet dependency
- [Story] labels map every story-phase task to US1/US2/US3/US4 for traceability
- No tests here are constitution-gating — this feature adds no auth, isolation, or file-access
  surface (see plan.md's Constitution Check) — but the E2E bounding-box tests are the only way to
  actually verify the acceptance scenarios, since the defects are real-browser layout bugs that
  jsdom-based component tests cannot see
- `frontend/src/styles/global.css` is touched by US1, US2, US3, and US4 in different rule
  blocks — intentionally not marked `[P]` across stories where a real selector dependency exists
  (T009 on T004); otherwise land each story's CSS as its own commit to avoid merge noise
- Commit after each task or logical group; stop at any checkpoint to validate a story
  independently

---

## Execution Notes (post-implementation)

- T004 and T009 landed as one edit (same `.viewer__content img, .viewer__content video` rule) —
  the plan already called out that dependency, and splitting the edit into two passes would have
  just meant editing the same lines twice.
- T011/T012 also needed a small CSS addition beyond the task text: `.viewer__bar` was a single
  `nowrap`+ellipsis text node, which would have let a long filename's ellipsis crowd out the new
  position label. Added `.viewer__title`/`.viewer__position` (flex row: title shrinks/ellipsizes,
  position never shrinks) so the label stays visible regardless of filename length — still the
  same rule block T004 already touches, no new file.
- All four new bounding-box E2E tests (T001, T003, T005, T008) were run against a real Chromium
  browser (both `desktop-chromium` and `mobile-360` Playwright projects) on a production build
  (`npm run build && npm start`), pointed at a disposable, isolated SQLite database — not just
  written and left unexecuted. All 8 runs passed, and the full existing `browse-media.spec.ts`
  suite (24 tests total) plus `us1-browse`/`us2-upload`/`us3-organize`/`us4-isolation` passed with
  no regressions.
- One transient failure during that verification (`us4-isolation`'s login timing out with a 429)
  was the backend's own login rate-limiter (`max: 60/minute`) responding to the volume of manual
  login calls made while investigating and re-running tests in this session — not a code
  regression. Confirmed by re-running the same test alone once the window cleared: pass.
- T015: `npm run test` (backend 137/137, frontend 25/25) and `npm run typecheck` (both
  workspaces) are clean.
