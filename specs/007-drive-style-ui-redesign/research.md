# Research: Drive-Style UI Redesign (007)

Structural findings verified against the current code, and the decisions that follow from
them. All paths relative to repo root.

## 1. Current-state findings (verified)

- **Shell**: `frontend/src/app/AppLayout.tsx` renders a single top bar: brand, six text
  `NavLink`s, username, Sign out. There is no sidebar, no icons, no user menu. `Browse` owns
  the search input inside its own toolbar (`frontend/src/pages/Browse/index.tsx:262-274`),
  so search is only reachable on the Files page.
- **Theme**: `frontend/src/styles/global.css` defines one hard-coded dark palette on `:root`
  (`--bg: #0f1115` etc.) with `color-scheme: dark light` declared but no light values —
  the app is dark-only regardless of device preference.
- **Icons**: every icon in the app is an emoji or ASCII glyph: `📁 📄 🖼️ 🎞️ 🎵`
  (`Thumbnail.tsx:5-11`, `Trash/index.tsx:80`, `Shared/index.tsx:98`, `MyShares.tsx:56`,
  `dialogs.tsx:175`), `⭳` (download), `⋮` (menu), `✕` (dismiss), `‹ ›` (viewer nav).
- **Cards**: one uniform `.file-card` (square thumb + name + meta) for folders and files
  alike. The server sorts children **folders first** (`backend/src/modules/nodes/
  repository.ts:153` — `type DESC, name ASC, id ASC`), so a partitioned "Folders / Files"
  presentation preserves the flat `items[]` order the carousel indexes into.
- **⋮ menu**: `.file-card__menu` is absolutely positioned `top: 100%; right: 0` inside
  `.file-card-wrapper` (`global.css:330`), so a menu opened on the bottom row can extend
  past the viewport bottom — FR-012's repositioning does not exist today.
- **Dialogs**: `ConfirmDialog`/`PromptDialog`/`MoveDialog`/`ShareDialog`/`DownloadUrlDialog`
  all close on backdrop click but **not on Escape** (only the card menu and the viewers
  listen for Escape). FR-011 requires Escape everywhere.
- **Upload progress**: `.upload-list` is an absolutely-positioned popover under the toolbar
  Upload button (`Uploader.tsx`, `global.css:493`). If the Upload trigger moves into a "New"
  menu, the progress list needs a new anchor.
- **List screens**: Trash, Shared-with-me, My shares, Downloads, Users all use ad-hoc
  `.list-row` flex rows with inline styles; no shared column structure.
- **View state**: nothing is persisted client-side today (no localStorage use in
  `frontend/src`), so preference persistence is greenfield.
- **Tests that pin UI surface** (must keep passing or be updated deliberately):
  - Unit (Vitest/Testing Library): `frontend/tests/{FileGrid,Thumbnail,Uploader,DropZone,
    Viewers,ShareDialog}.test.tsx`.
  - E2E (Playwright): `e2e/tests/*.spec.ts` select by accessible name/label:
    `'New folder'`, `'Select'`, `'Done selecting'`, `'Select all'`, `'Details for <name>'`,
    `'Choose files to upload'`, `'Search files'`, `'Folder name'`, `'Next'`/`'Previous'`,
    `link 'Files'`, viewer dialog names, `'Move to Trash'`, etc.

## 2. Decisions

### D1 — Design tokens: extend the existing CSS-custom-property system, no framework

**Decision**: Rebuild `global.css` around an expanded token set (surface scale, text scale,
accent scale, hover/selected states, elevation shadows, radius scale, spacing scale) defined
twice: light values (default, Drive-like: app background `#f6f8fc`-family, white surfaces,
blue `#1a73e8`-family accent, pill-shaped controls) and dark values. All components consume
tokens only.

**Rationale**: The app already uses CSS custom properties throughout; extending the same
mechanism restyles every screen at once with zero dependencies (constitution: simplicity,
self-hosted). A CSS framework or component library would add a dependency for no capability.

**Alternatives considered**: Tailwind / CSS modules / a component library — all rejected:
new dependency + wholesale component rewrites, against the project's no-new-dependency
pattern for UI features (003/004/005 precedent).

### D2 — Theming: `data-theme` attribute + tiny pre-paint script + React context

**Decision**: `:root` carries light tokens; `:root[data-theme='dark']` overrides with dark
tokens; with no stored choice a `@media (prefers-color-scheme: dark)`-guarded default block
applies dark automatically (attribute `system` state). A ~5-line inline script in
`frontend/index.html` reads `localStorage['ftdrive:theme']` and stamps `data-theme` before
first paint (no flash). A small `ThemeProvider` (`frontend/src/app/theme.tsx`) exposes
`{theme, setTheme}` (`'light' | 'dark' | 'system'`), writes localStorage, and re-stamps the
attribute; the control lives in the new user menu.

**Rationale**: Standard, dependency-free, and satisfies FR-009 (system default, instant
switch, persistence) with the attribute as the single source of truth for CSS.

**Alternatives considered**: CSS-only `prefers-color-scheme` (no user override — fails
FR-009); React-state-only theming via style props (flash of wrong theme, misses non-React
surfaces like scrollbars/`color-scheme`).

### D3 — Icons: one `Icon` component with inline SVG paths

**Decision**: New `frontend/src/components/Icon.tsx`: `<Icon name="folder" />` renders an
inline `<svg viewBox="0 0 24 24">` with `fill="currentColor"`/stroke paths, sized via
`1em`/CSS. One module holds ~28 paths (folder, folder-shared, file, image, video, audio,
archive, download, upload, share, link, person, people, edit, move, trash, restore, close,
more-vert, chevron-left/right/down, search, menu, plus, check, grid, list, clock, logout,
sun/moon, cloud, drive-logo mark). All emoji/ASCII glyph call sites switch to it (SC-007).

**Rationale**: Inline SVG is the only zero-dependency, self-hosted way to get a consistent,
theme-aware (currentColor) icon set; ~28 hand-picked outline paths keep the module small.

**Alternatives considered**: An icon font or `react-icons`/`lucide-react` (new dependency;
lucide's tree-shaken import would be acceptable weight but the project pattern is no new
deps and ~28 static paths don't justify one); per-file `.svg` assets (loses currentColor
theming ergonomics and adds asset plumbing).

### D4 — App shell: persistent sidebar + top bar, drawer under 900px

**Decision**: `AppLayout` becomes grid `[sidebar | main]` with a full-width top bar. Top
bar: hamburger (narrow only), brand (logo mark + "FtDrive", links to `/`), search field
(see D5), user menu (avatar initial button → popover with username, Account link, theme
control, Sign out). Sidebar: prominent "New" button (see D6) then nav — My Drive, Shared,
Downloads, Trash, + Users for owners — each `NavLink` with icon + label and a pill active
state. Below 900px the sidebar renders as an off-canvas drawer over a scrim, opened by the
hamburger, closed by scrim tap / Escape / navigation.

**Rationale**: This is the recognizable Drive layout the spec asks for; 900px matches
"desktop-width vs phone-width" validation splits already used in the project; off-canvas
via a CSS class + transform needs no library.

**Alternatives considered**: Keeping top-bar-only navigation with better styling (fails the
"drive-like" core of the spec); a collapsible mini-rail (extra complexity, no spec value).

### D5 — Search moves to the top bar; query lives in the URL

**Decision**: The search input moves from Browse's toolbar into the top bar (rendered by
`AppLayout`, aria-label `"Search files"` preserved). Typing navigates (replace) to
`/search?q=<text>`; `Browse` (already routed at `/search`) reads `q` via `useSearchParams`
instead of local state. Clearing the field returns to `/`. Behavior is unchanged: same
endpoint, results replace the folder view, selection cleared on query change.

**Rationale**: FR-003 puts search in the top bar; the only state-lifting mechanism that
doesn't add a context or duplicate state is the URL, which the `/search` route already
anticipates. Bonus: search results become linkable/back-button friendly.

**Alternatives considered**: A `SearchContext` shared between shell and Browse (more moving
parts, state duplicated with the route); keeping search inside Browse and visually faking
top-bar placement (breaks on non-Browse pages, brittle CSS).

### D6 — "New" action: sidebar button + menu, wired through a shell-actions context

**Decision**: The sidebar's "New" button opens a popover menu: New folder, Upload files,
Download from web. A tiny `ShellActionsContext` (`frontend/src/app/shellActions.tsx`) lets
the mounted Browse page register handlers (`{newFolder, uploadFiles, downloadFromWeb}`);
the button is enabled when handlers are registered (i.e., on `/` and `/folder/:id`) and
disabled with an explanatory tooltip elsewhere. "Upload files" clicks Browse's existing
hidden file input (label `"Choose files to upload"` kept); the other two open the existing
dialogs. The toolbar loses its New-folder/Download-from-web/Upload buttons; Select and the
new grid/list toggle remain.

**Rationale**: FR-002 wants one prominent creation entry point "wherever the user can add
content" — that is exactly the Browse views; a context registration is the smallest wiring
that keeps upload state (`useUploader(fid)`) owned by Browse, bound to the current folder.

**Alternatives considered**: Global uploader mounted in the shell targeting the current
folder id from the route (moves upload ownership out of Browse, larger refactor, no user
value); hiding New off Browse pages entirely (spec allows it, but a visible-disabled state
teaches where creation lives — Drive does the same on its computers/trash views).

### D7 — Upload progress becomes a fixed bottom-right tray

**Decision**: The upload list detaches from the Upload button: new `UploadTray` component
(extracted from `Uploader.tsx`) rendered by Browse as a fixed bottom-right card (Drive's
pattern), with per-file rows (icon, name, progress bar, retry/dismiss), a header with
overall count, and Clear. `Uploader` shrinks to the hidden `<input type=file>` + an
imperative `open()` exposed to the New menu via the shell-actions registration.

**Rationale**: The current popover is anchored to a button that no longer exists after D6;
a bottom-right tray is the Drive-familiar home for transfer progress and stays visible
while the user keeps browsing.

**Alternatives considered**: Progress rows inline in the file grid (noisy, unfamiliar);
keeping a toolbar anchor (no toolbar Upload button remains).

### D8 — Folder view: sectioned grid, compact folder tiles, grid/list toggle persisted

**Decision**: `FileGrid` gains `view: 'grid' | 'list'`. Grid view partitions the (already
folders-first) items into a "Folders" section of compact tiles (icon + name + ⋮, no thumb
square) and a "Files" section of thumbnail cards — section headers only when both kinds
exist. List view renders the same flat order as single-column rows: type icon/mini-thumb,
name, size, quick Download, ⋮ — with a lightweight header row (Name / Size) on wide
screens. Browse owns `viewMode`, persisted at `localStorage['ftdrive:viewMode']`; the
toggle (grid/list icon button pair, aria-pressed) sits in Browse's toolbar. Shared browse
/ public share keep the (restyled) grid view; the toggle is a My-Drive feature per spec.
Selection checkboxes, ⋮ menu, keyboard activation and the `div[role=button]` card contract
(005) are preserved in both views; carousel indexing is untouched because display order ==
`items[]` order (see finding above).

**Rationale**: Matches Drive's most recognizable browse presentation while keeping every
005 interaction invariant and the 003 carousel derivation safe.

**Alternatives considered**: A real `<table>` for list view (worse responsive behavior,
harder to keep card interaction contract); client-side re-sorting (would desync carousel
order from display order — rejected outright).

### D9 — ⋮ menu edge handling: flip via measured class, still a sibling popover

**Decision**: Keep the portal-free sibling-popover approach (005 precedent). On open,
measure the trigger's `getBoundingClientRect()`; if the space below is under a menu-height
threshold, add `--up` (opens above); if the wrapper is within a menu-width of the left
viewport edge, align left instead of right. Same measurement utility serves the New menu
and user menu.

**Rationale**: Satisfies FR-012 with ~15 lines and no portal/library; popovers already
z-index above sibling cards.

**Alternatives considered**: Portal + floating-ui (new dependency); pure-CSS `max()`
clamping (cannot flip vertically).

### D10 — List screens standardize on one `ListRow` recipe

**Decision**: One shared row structure (icon slot, primary text, secondary text, trailing
actions) expressed as CSS (`.list-row` rebuilt: 40px icon cell, two-line text cell,
right-aligned action cluster, hover state) and applied to Trash, Shared-with-me, My shares,
Downloads, Users. Row action buttons become icon buttons with aria-labels (text kept where
tests pin it, e.g. Restore / Delete forever stay text buttons). Empty states across these
screens use a shared `EmptyState` component (icon, title, hint).

**Rationale**: FR-008's cross-screen consistency; CSS-first (shared classes) avoids
force-fitting five differently-shaped datasets through one generic component API.

**Alternatives considered**: A generic `<DataList>` component with column config (the five
screens' rows differ enough — progress bars, badges, expiry editors — that the config API
would exceed the CSS it replaces).

### D11 — Dialogs: shared chrome, Escape everywhere, focus discipline

**Decision**: Add a `useDialogDismiss(onClose)` hook (Escape listener + returns backdrop
click handler) used by every modal (`dialogs.tsx`, `ShareDialog`, `DownloadUrlDialog`,
Preview fallback). Modal chrome restyled: title row (title + icon close button), body,
right-aligned action row; destructive confirms keep `btn--danger` emphasis with the safe
action as the plain default. `autoFocus` on the primary input (existing) or Cancel for
destructive confirms.

**Rationale**: FR-011 (Escape) is currently unmet in dialogs; one hook fixes all six modals
consistently.

**Alternatives considered**: `<dialog>` element (focus/inert benefits but restyling +
jsdom/test friction outweigh for this pass); full focus-trap implementation (beyond spec —
noted as future work).

### D12 — Test compatibility strategy

**Decision**: Preserve accessible names/labels wherever the control survives (`Search
files`, `Choose files to upload`, `Folder name`, `Details for <name>`, `Select <name>`,
`Select all`, `Done selecting`, viewer `Previous`/`Next`/`Close`, `Move to Trash`, dialog
titles). Update tests only where placement genuinely changed: (a) e2e `link 'Files'` →
sidebar `link 'My Drive'`; (b) e2e flows that click toolbar `New folder` / Upload /
`Download from web` now open the sidebar New menu first (helper function added once in
each spec file); (c) `Uploader` unit test follows the `UploadTray` extraction; (d) new unit
tests for Icon fallback rendering, theme provider persistence, FileGrid list view +
sectioning, menu flip positioning.

**Rationale**: The test suite is the behavior-parity net for FR-006/SC-002; minimizing
label churn keeps the diff reviewable and failures meaningful.

**Alternatives considered**: Renaming freely and rewriting tests wholesale (throws away the
parity net exactly when it's most needed).

### D13 — Typography & branding

**Decision**: Keep the system-ui font stack (no webfont — self-hosted constitution, no
network fetch). Brand = inline SVG logo mark (abstract folder/drive glyph in accent color)
+ "FtDrive" wordmark text, used in top bar, login card, and public share header. Larger
type scale for page titles (`h1 22px/500`), 14px base UI text, 13px secondary.

**Alternatives considered**: Bundling a webfont file (adds weight for marginal gain;
system-ui is high quality on all target platforms).

## 3. Risks & mitigations

- **Biggest diff is `global.css`** (~800 lines rewritten): mitigate by keeping every class
  name that tests or components reference, additive new classes, and validating with the
  full unit + e2e suites plus the quickstart walkthrough.
- **Search refactor touches Browse state**: `q` moves to URL — covered by existing
  `us1-browse` e2e search scenarios plus manual SC-002 walkthrough.
- **E2E churn**: confined to selectors listed in D12; run the suite after implementation
  and fix drift in the same feature branch.
