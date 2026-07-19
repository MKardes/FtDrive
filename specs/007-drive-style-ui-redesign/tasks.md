# Tasks: Drive-Style UI Redesign

**Input**: Design documents from `/specs/007-drive-style-ui-redesign/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D13), data-model.md, quickstart.md

**Tests**: Included — the plan's Testing section commits to updated + new Vitest suites and
an updated Playwright suite as the FR-006 behavior-parity gate (research.md D12). Test
tasks live inside the story they protect; they are not TDD-first.

**Organization**: Grouped by user story (spec.md US1–US4) after a foundational
design-system phase. All work is inside `frontend/` and `e2e/` — no backend tasks exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- Note: `frontend/src/styles/global.css` is one shared file — tasks touching it are never
  [P] against each other and are ordered.

---

## Phase 1: Setup

**Purpose**: Branch per project working agreements; no scaffolding needed (no new deps).

- [X] T001 Create branch `feat/007-drive-style-ui-redesign` from `feat/006-share-links` (006 is unmerged and this feature builds on its UI)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The design-system primitives every story consumes — tokens, theme plumbing,
icons, shared UI utilities.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Rewrite `frontend/src/styles/global.css` into the D1 token system: light-default token set on `:root`, dark overrides on `:root[data-theme='dark']` plus a `@media (prefers-color-scheme: dark)` block for the no-choice state; spacing/radius/elevation/typography scales; restyled base elements and existing recipes (`.btn*`, `.input`, `.field`, `.card`, `.modal*`, `.badge*`, `.progress-bar*`, `.spinner`, `.empty-state`, `.tabs`) with visible `:focus-visible` states — **keep every existing class name working** (research.md D1/D2, FR-007/FR-011)
- [X] T003 [P] Create `frontend/src/components/Icon.tsx`: single `<Icon name=… />` inline-SVG component (24×24, currentColor) with the ~28 glyphs from research.md D3 (folder, file, image, video, audio, archive, download, upload, share, link, person, people, edit, move, trash, restore, close, more-vert, chevrons, search, menu, plus, check, grid, list, clock, logout, sun, moon, cloud)
- [X] T004 [P] Create `frontend/src/components/Logo.tsx`: inline-SVG brand mark + "FtDrive" wordmark (research.md D13)
- [X] T005 [P] Create `frontend/src/app/theme.tsx`: `ThemeProvider`/`useTheme` — `'light' | 'dark' | 'system'`, reads/writes `localStorage['ftdrive:theme']` (validated), stamps/removes `data-theme` on `<html>` (research.md D2, data-model.md)
- [X] T006 [P] Add pre-paint theme script (reads `ftdrive:theme`, stamps `data-theme` before first paint) and light/dark `theme-color` metas to `frontend/index.html`
- [X] T007 [P] Create `frontend/src/components/menuPosition.ts`: popover placement helper — measure trigger rect vs viewport, return `{ up, alignLeft }` (research.md D9, FR-012)
- [X] T008 [P] Create `frontend/src/app/useDialogDismiss.ts`: Escape-key listener + backdrop-click handler hook shared by all modals (research.md D11, FR-011)
- [X] T009 [P] Create `frontend/src/components/EmptyState.tsx`: shared empty-state block (Icon, title, hint slot) (research.md D10)

**Checkpoint**: Tokens/theme/icons exist — the app still renders with the old layout but
new palette; user stories can begin.

---

## Phase 3: User Story 1 — Navigate a modern app shell (Priority: P1) 🎯 MVP

**Goal**: Sidebar (New button + icon nav) + top bar (brand, search, user menu), drawer
under 900px; every existing destination/action reachable (FR-001/002/003).

**Independent Test**: quickstart.md steps 1–4 — visit every area from the sidebar on
desktop and 360px widths, create folder / upload / web-download via New, run a search.

### Implementation for User Story 1

- [X] T010 [US1] Create `frontend/src/app/shellActions.tsx`: `ShellActionsProvider` + `useShellActions`/`useRegisterShellActions` — Browse registers `{ newFolder, uploadFiles, downloadFromWeb }`, New button consumes; `null` ⇒ disabled (research.md D6)
- [X] T011 [P] [US1] Create `frontend/src/components/TopBarSearch.tsx`: search input (aria-label **"Search files"** preserved) that replace-navigates to `/search?q=<text>` on input and back to `/` when cleared (research.md D5)
- [X] T012 [P] [US1] Create `frontend/src/components/UserMenu.tsx`: avatar-initial button → popover (username header, Account link, Sign out; theme control slot filled in US4) using `menuPosition` + outside-click/Escape close
- [X] T013 [US1] Create `frontend/src/components/Sidebar.tsx`: prominent "New" button opening a popover menu (New folder / Upload files / Download from web) wired to `useShellActions` (disabled + tooltip when unregistered), then icon+label `NavLink`s — My Drive `/`, Shared `/shared`, Downloads `/downloads`, Trash `/trash`, Users `/admin` (owner only)
- [X] T014 [US1] Rewrite `frontend/src/app/AppLayout.tsx`: top bar (hamburger <900px, `Logo`, `TopBarSearch`, `UserMenu`) + `Sidebar` + routed main; off-canvas drawer state with scrim, Escape close, close-on-navigate (data-model.md `drawerOpen`)
- [X] T015 [US1] Add shell CSS to `frontend/src/styles/global.css`: app grid, top bar, sidebar, nav pills with active state, New button, drawer/scrim transitions at the 900px breakpoint, popover menu recipe (shared by New/user/⋮ menus) with `--up`/`--left` placement classes
- [X] T016 [US1] Wire `ThemeProvider` + `ShellActionsProvider` into `frontend/src/app/App.tsx`
- [X] T017 [US1] Refactor search in `frontend/src/pages/Browse/index.tsx`: read `q` from `useSearchParams` (route `/search` already exists) instead of local state; clear selection on query change; remove the toolbar search input
- [X] T018 [US1] Extract `frontend/src/components/UploadTray.tsx` (fixed bottom-right progress card: header w/ count, per-file rows — icon, name, progress, retry/dismiss — Clear button; `role="status"` kept) and shrink `frontend/src/components/Uploader.tsx` to the hidden input (aria-label **"Choose files to upload"** kept) + imperative `open()` (research.md D7)
- [X] T019 [US1] In `frontend/src/pages/Browse/index.tsx`: register shell actions (newFolder→create dialog, uploadFiles→Uploader.open, downloadFromWeb→URL dialog), render `UploadTray`, remove the toolbar "New folder"/"Download from web"/Upload buttons (keep Select)
- [X] T020 [US1] Update `frontend/tests/uploader.test.tsx` for the Uploader/UploadTray split; add `frontend/tests/AppShell.test.tsx` covering sidebar nav rendering, owner-only Users link, New-button disabled state off-Browse
- [X] T021 [US1] Update e2e for the new shell in `e2e/tests/*.spec.ts`: `link 'Files'` → sidebar `link 'My Drive'`; add a per-file helper that opens the sidebar New menu before clicking 'New folder'/'Download from web'/upload (research.md D12)

**Checkpoint**: App is fully navigable through the new shell at both widths; uploads,
folder creation, web downloads, and search all work from their new homes.

---

## Phase 4: User Story 2 — Browse files the drive way (Priority: P2)

**Goal**: Sectioned folder view (compact folder tiles + thumbnail file cards), grid/list
toggle persisted, breadcrumb path, on-screen ⋮ menus, styled empty/drop states
(FR-004/005/012 within Browse).

**Independent Test**: quickstart.md steps 5–11 on a mixed 200+-item folder.

### Implementation for User Story 2

- [X] T022 [US2] Extend `frontend/src/components/FileGrid.tsx`: `view: 'grid' | 'list'` prop; grid view partitions items into "Folders" (compact tiles) / "Files" (thumbnail cards) sections without reordering (server sorts folders first — research.md D8); list view renders flat rows (mini thumb/icon, name, size, quick action, ⋮) with a Name/Size header on wide screens; ⋮ popover placement via `menuPosition` (`--up`/`--left`); preserve `div[role=button]` contract, `Details for <name>` / `Select <name>` labels, single-open-menu and select-mode behavior
- [X] T023 [P] [US2] Update `frontend/src/components/Thumbnail.tsx`: emoji `iconFor` → `<Icon>` glyphs (folder/image/video/audio/file), size variant for list rows; keep IntersectionObserver lazy-load and failure fallback
- [X] T024 [P] [US2] Restyle `frontend/src/components/Breadcrumb.tsx`: chevron `<Icon>` separators, current-folder emphasis, truncation-friendly markup (visual only — same `onNavigate` contract)
- [X] T025 [US2] Update `frontend/src/pages/Browse/index.tsx`: `viewMode` state initialized from validated `localStorage['ftdrive:viewMode']`, written on toggle; grid/list icon-toggle (aria-pressed) in the toolbar next to Select; pass `view` to FileGrid; use `EmptyState` for empty-folder (pointing at New) and no-results states
- [X] T026 [US2] Add browse CSS to `frontend/src/styles/global.css`: folder tiles, file cards (hover shade, selected state), section headers, list rows + header row, view-toggle group, restyled `.bulk-bar`, load-more row, `.dropzone--active` overlay with centered "Drop files to upload" message
- [X] T027 [P] [US2] Restyle `frontend/src/components/DropZone.tsx`: render the overlay message element (styled by T026) when active; logic unchanged
- [X] T028 [P] [US2] Restyle `frontend/src/components/BulkResultPanel.tsx` to the token card recipe with per-item icon + message rows
- [X] T029 [US2] Update `frontend/tests/FileGrid.test.tsx` (sections, list view, menu flip class) and `frontend/tests/Thumbnail.test.tsx` (Icon fallback instead of emoji)
- [X] T030 [US2] Run + fix drift in grid-dependent e2e specs `e2e/tests/{us1-browse,us3-organize,browse-media,actions-menu-bulk-select}.spec.ts` (accessible names were preserved; fix any layout-dependent assumptions)

**Checkpoint**: The folder view is the Drive-style centerpiece; all 005 interactions and
003 carousel behavior intact in both views.

---

## Phase 5: User Story 3 — Every screen speaks the same language (Priority: P3)

**Goal**: Sign-in, Trash, Shared, Downloads, Users, Account, dialogs, viewers and the
public share page all on the shared system (FR-007/008/013).

**Independent Test**: quickstart.md steps 12–16 — full walkthrough of every screen + a
public link in a private window.

### Implementation for User Story 3

- [X] T031 [US3] Add shared recipes to `frontend/src/styles/global.css`: page-header row, structured `.list-row` (40px icon cell, two-line text cell, right-aligned action cluster, hover), restyled `.tabs`, auth screen backdrop, public-share chrome, dialog title-row/body/action-row chrome, viewer control styling
- [X] T032 [US3] Apply dialog chrome + `useDialogDismiss` (Escape) to `frontend/src/features/nodes/dialogs.tsx` (Confirm/Prompt/Move): title row with icon close button, destructive emphasis with safe default, folder rows in MoveDialog use `<Icon name="folder">`
- [X] T033 [P] [US3] Restyle `frontend/src/components/ShareDialog.tsx` + `frontend/src/components/ExpiryControl.tsx`: dialog chrome, Escape, link/people/clock icons, chip + picker polish (labels/roles unchanged)
- [X] T034 [P] [US3] Restyle `frontend/src/components/DownloadUrlDialog.tsx` + `frontend/src/components/CandidatePicker.tsx`: dialog chrome, Escape, step layout polish
- [X] T035 [P] [US3] Update `frontend/src/components/Preview.tsx` (fallback modal → dialog chrome + Escape hook) and `frontend/src/components/PhotoViewer.tsx` / `frontend/src/components/VideoPlayer.tsx`: icon buttons for close/prev/next (aria-labels **Close/Previous/Next** kept), restyled title/position bar
- [X] T036 [P] [US3] Restyle `frontend/src/pages/Login/index.tsx`: branded centered card (`Logo`), token form styles
- [X] T037 [P] [US3] Restyle `frontend/src/pages/Trash/index.tsx`: page header, ListRow recipe (type icon, name + days-left secondary line, Restore / Delete forever actions), `EmptyState`
- [X] T038 [P] [US3] Restyle `frontend/src/pages/Shared/index.tsx` + `frontend/src/pages/Shared/MyShares.tsx`: pill tabs, ListRow recipe with icons for shared-with-me and my-shares rows, `EmptyState`s, shared-browse breadcrumb consistency
- [X] T039 [P] [US3] Restyle `frontend/src/components/DownloadsPanel.tsx` + `frontend/src/components/DownloadRow.tsx`: page header, ListRow recipe (title, status badge, progress bar, byte counts, state-appropriate icon actions), `EmptyState`
- [X] T040 [P] [US3] Restyle `frontend/src/pages/Admin/index.tsx` (page header, add-user card, user ListRows with person icon + role/email secondary text) and `frontend/src/pages/Account/index.tsx` (page header, card recipe)
- [X] T041 [P] [US3] Restyle `frontend/src/pages/PublicShare/index.tsx`: branded public top bar (`Logo` + "Shared with you" chip), file hero card with Preview/Download, folder grid via restyled FileGrid, styled unavailable state — no signed-in chrome (FR-013)
- [X] T042 [US3] Update `frontend/tests/ShareDialog.test.tsx` and `frontend/tests/Viewers.test.tsx` for chrome changes (icon buttons keep accessible names); verify `frontend/tests/DropZone.test.tsx` still green
- [X] T043 [US3] Run + fix drift in remaining e2e specs `e2e/tests/{downloads,us2-upload,us4-isolation,performance}.spec.ts`

**Checkpoint**: No screen retains the old styling; behavior parity net (unit + e2e) green.

---

## Phase 6: User Story 4 — Choose a comfortable appearance (Priority: P4)

**Goal**: Light/Dark/System control in the user menu, instant apply, persisted; both
themes legible everywhere (FR-009).

**Independent Test**: quickstart.md steps 17–19.

### Implementation for User Story 4

- [X] T044 [US4] Add the appearance control (Light / Dark / System with sun/moon icons, current choice checked) to `frontend/src/components/UserMenu.tsx` via `useTheme`
- [X] T045 [US4] Dark-theme audit pass over `frontend/src/styles/global.css`: verify every recipe added in T015/T026/T031 against dark tokens; fix contrast to ≥4.5:1 for text/labels in both themes (SC-005), including viewer, menus, dialogs, badges, scrim
- [X] T046 [P] [US4] Add `frontend/tests/theme.test.tsx`: system default (no key), setTheme stamps attribute + persists, invalid stored value treated as absent, UserMenu control switches theme

**Checkpoint**: All four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T047 Sweep `frontend/src` for leftover emoji/ASCII UI glyphs (`grep` for 📁📄🖼️🎞️🎵⭳⋮✕‹›) and stray `style={{…}}` inline styles replaced by recipes; remove dead CSS classes from `frontend/src/styles/global.css` (SC-007)
- [X] T048 Run `npm run typecheck && npm test && npm run build` in `frontend/`; fix all fallout
- [X] T049 Run the full Playwright suite in `e2e/` against the running stack; fix any remaining drift (FR-006/SC-002 gate)
- [X] T050 Execute the quickstart.md walkthrough at desktop + 360px in both themes; fix findings; confirm SC-001–SC-008

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — do first.
- **Phase 2 (Foundational)**: after T001. T002 (global.css) has no task dependencies;
  T003–T009 are mutually parallel.
- **Phase 3 (US1)**: needs Phase 2 (tokens, Icon, Logo, theme, menuPosition). Internal
  order: T010 → T013 → T014 → (T016…T019); T011/T012 parallel after Phase 2; T015 after
  T014; tests T020/T021 last.
- **Phase 4 (US2)**: needs Phase 2; layout-independent of US1 except Browse-file overlap —
  T025 touches `Browse/index.tsx` after T017/T019, and T026 touches `global.css` after
  T015. Recommended: run after US1.
- **Phase 5 (US3)**: needs Phase 2 (+ shell recipes from US1 for consistent chrome). T031
  (global.css) before the [P] screen tasks T033–T041; T032 before/parallel-with them is
  fine (different file).
- **Phase 6 (US4)**: T044 needs UserMenu (T012); T045 needs all CSS phases (T015, T026,
  T031).
- **Phase 7 (Polish)**: after all desired stories.

### Key file-conflict chains (never parallelize)

- `frontend/src/styles/global.css`: T002 → T015 → T026 → T031 → T045 → T047
- `frontend/src/pages/Browse/index.tsx`: T017 → T019 → T025
- `frontend/src/components/UserMenu.tsx`: T012 → T044

### Parallel Opportunities

- Phase 2: T003, T004, T005, T006, T007, T008, T009 together (T002 alongside — different
  file).
- US1: T011 + T012 together; then T018 alongside T013/T014.
- US2: T023, T024, T027, T028 together while T022 is in progress (different files).
- US3: after T031/T032 land, T033–T041 are all parallel (nine independent files).

---

## Implementation Strategy

**MVP first (US1)**: Phases 1–3 deliver the drive-style shell with every capability still
reachable — demoable on its own (the rest of the app renders old-layout-new-palette).
Then US2 (the highest-traffic screen), US3 (consistency sweep), US4 (appearance), Polish.
Stop at any checkpoint: each phase leaves the app fully functional — the parity tests
(T020/T021, T029/T030, T042/T043) run inside their story, not deferred to the end.
