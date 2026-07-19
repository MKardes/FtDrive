# Implementation Plan: Drive-Style UI Redesign

**Branch**: `007-drive-style-ui-redesign` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-drive-style-ui-redesign/spec.md`

## Summary

Redesign the entire frontend to a Google-Drive-like experience: a persistent icon sidebar
with a prominent "New" action, a top bar with brand, centered search and a user menu; a
sectioned folder view (compact folder tiles + thumbnail file cards) with a persisted
grid/list toggle; one consistent design system (tokens, SVG icon set, dialogs, list rows,
empty states) applied to every screen including sign-in, the viewer and the public share
page; and a light default appearance with a persisted dark option.

**Technical approach**: **Frontend-only** — no new backend endpoint, table, or contract, no
new dependency. The existing CSS-custom-property system in `global.css` is expanded into a
full light+dark token set switched by a `data-theme` attribute (pre-paint inline script +
small ThemeProvider, `research.md` D2); every emoji/ASCII glyph is replaced by one inline-SVG
`Icon` component (D3); `AppLayout` becomes sidebar+topbar shell with an off-canvas drawer
under 900px (D4); search moves to the top bar with its query lifted into the URL the
`/search` route already anticipates (D5); the "New" menu wires to Browse's existing
create/upload/web-download handlers through a small shell-actions context (D6), with upload
progress relocated to a Drive-style bottom-right tray (D7); `FileGrid` gains a list view and
folders/files sectioning that is safe because the server already sorts folders first (D8);
the ⋮ popover learns viewport-edge flipping without a portal (D9); list screens share one
row recipe and dialogs share chrome + Escape dismissal (D10/D11). Accessible names that the
Vitest and Playwright suites pin are preserved wherever the control survives; tests are
updated only where placement genuinely changed (D12).

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 + Vite — unchanged from features 001–006.

**Primary Dependencies**: None new. Existing `react-router-dom` (URL-driven search, NavLink
sidebar), `@tanstack/react-query` (untouched data layer), plain CSS custom properties,
inline SVG. `localStorage` for the two client-side preferences.

**Storage**: N/A server-side — zero new persisted server state. Client: two localStorage
keys, `ftdrive:theme` (`'light' | 'dark'`, absent = follow device) and `ftdrive:viewMode`
(`'grid' | 'list'`, absent = grid). See `data-model.md`.

**Testing**: Vitest + Testing Library (updated `FileGrid`/`Uploader` tests; new tests for
theme persistence, list view + sectioning, menu flip, Icon fallback); Playwright e2e suite
updated per research.md D12 (sidebar `My Drive` link, New-menu-first flows) and re-run as
the FR-006 behavior-parity gate; `tsc --noEmit` and `vite build` as static gates.

**Target Platform**: Modern desktop + mobile browsers for the SPA; validated at desktop
width and 360px phone width (project-standard breakpoints), sidebar/drawer switch at 900px.

**Project Type**: Web application — frontend-only change inside the existing `frontend/` SPA
(plus test updates under `frontend/tests/` and `e2e/tests/`).

**Performance Goals**: No regression to listing/thumbnail behavior — IntersectionObserver
lazy thumbnails, keyset "Load more" pagination and query caching are untouched; theme and
view toggles apply without reload or refetch; 200+-item folders stay smooth in both views
(SC-008).

**Constraints**:
- Presentation-only: every capability in FR-006 behaves identically; only placement and
  appearance change. No new server surface (Constitution I/II inherited untouched).
- No new dependency; no external fetches (fonts, icon CDNs) — icons and logo are inline SVG,
  fonts stay system-ui (Constitution III).
- Class names and accessible names pinned by the existing test suites are preserved except
  the deliberate, enumerated changes in research.md D12.
- 360px usability with no horizontal scroll (FR-010/SC-004); WCAG-AA 4.5:1 text contrast in
  both themes (SC-005); Escape closes every menu and dialog (FR-011).

**Scale/Scope**: ~10 pages/screens, ~20 components, one ~800-line stylesheet rewritten into
a token system, ~28-glyph icon module, 2 new context providers, 6 modals unified; e2e suite
of 8 spec files updated in-place.

## Constitution Check

*GATE: passed — re-evaluated after Phase 1 design, no violations.*

- **I. Security & Authentication First** — PASS. No new routes, endpoints, or data paths.
  Every rendered byte still arrives via the existing authenticated (or 006's token-scoped
  public) endpoints. The pre-paint theme script reads only localStorage; no secrets, no new
  storage of sensitive data.
- **II. Strict Per-User Data Isolation** — PASS. UI-only change; listings, thumbnails and
  content URLs keep flowing through the same owner-scoped hooks and `FileUrlContext`
  providers. No client-supplied id gains new trust.
- **III. Self-Hosted Data Ownership** — PASS. No external assets: icons/logo are inline SVG,
  fonts remain system-ui, zero third-party requests introduced.
- **IV. Media-First, Intuitive UI** — PASS (this feature *is* Principle IV work): clearer
  hierarchy, thumbnails preserved, common actions consolidated under one visible "New"
  entry point, explicit loading/error/empty states, responsive from 360px up, pagination
  untouched.
- **V. Reliable Sync & Data Integrity** — PASS. No transfer, storage, or destructive-action
  semantics change; trash-first deletion flows and confirmations are preserved (restyled
  only, with destructive emphasis retained).

**Development Workflow gates**: no auth/file-access code touched → no new isolation tests
required; behavior parity is instead gated by the updated e2e suite + SC-002 walkthrough
(quickstart.md). No secrets involved. Simplicity: zero new dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/007-drive-style-ui-redesign/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — findings D1–D13 (verified against code)
├── data-model.md        # Phase 1 — client-side view/preference state only
├── quickstart.md        # Phase 1 — validation walkthrough & gates
├── checklists/
│   └── requirements.md  # Spec quality checklist (passed)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory: frontend-only feature, no API surface added or changed (same
convention as features 003–005).

### Source Code (repository root)

```text
frontend/
├── index.html                        # + pre-paint theme script, theme-color
├── src/
│   ├── app/
│   │   ├── App.tsx                   # + ThemeProvider, ShellActionsProvider
│   │   ├── AppLayout.tsx             # REWRITE: topbar + sidebar/drawer shell (D4)
│   │   ├── theme.tsx                 # NEW: ThemeProvider + useTheme (D2)
│   │   └── shellActions.tsx          # NEW: New-menu handler registration (D6)
│   ├── components/
│   │   ├── Icon.tsx                  # NEW: inline-SVG icon set (D3)
│   │   ├── Logo.tsx                  # NEW: brand mark + wordmark (D13)
│   │   ├── Sidebar.tsx               # NEW: nav + New button/menu (D4/D6)
│   │   ├── UserMenu.tsx              # NEW: avatar popover — account/theme/signout (D4)
│   │   ├── TopBarSearch.tsx          # NEW: URL-driven search field (D5)
│   │   ├── EmptyState.tsx            # NEW: shared empty-state block (D10)
│   │   ├── UploadTray.tsx            # NEW: fixed bottom-right progress tray (D7)
│   │   ├── menuPosition.ts           # NEW: popover edge-flip measurement (D9)
│   │   ├── FileGrid.tsx              # view prop, sections, list rows, flip menu (D8/D9)
│   │   ├── Thumbnail.tsx             # emoji → Icon, list-size variant (D3/D8)
│   │   ├── Breadcrumb.tsx            # chevron separators, icons, restyle
│   │   ├── Uploader.tsx              # shrink: hidden input + imperative open (D7)
│   │   ├── Preview.tsx               # unified dialog chrome, Escape hook (D11)
│   │   ├── PhotoViewer.tsx           # icon controls, aria labels kept
│   │   ├── VideoPlayer.tsx           # icon controls, aria labels kept
│   │   ├── ShareDialog.tsx           # dialog chrome, icons, Escape (D11)
│   │   ├── DownloadUrlDialog.tsx     # dialog chrome, Escape (D11)
│   │   ├── DownloadRow.tsx           # ListRow recipe, icon actions (D10)
│   │   ├── DownloadsPanel.tsx        # page header recipe, EmptyState (D10)
│   │   ├── ExpiryControl.tsx         # restyle to token system
│   │   ├── BulkResultPanel.tsx       # restyle to token system
│   │   ├── CandidatePicker.tsx       # restyle to token system
│   │   └── DropZone.tsx              # restyled overlay message
│   ├── features/nodes/dialogs.tsx    # dialog chrome + Escape via hook (D11)
│   ├── pages/
│   │   ├── Browse/index.tsx          # search→URL, viewMode, toolbar, tray, shell reg.
│   │   ├── Login/index.tsx           # branded card on styled backdrop (D13)
│   │   ├── Trash/index.tsx           # ListRow recipe + EmptyState (D10)
│   │   ├── Shared/index.tsx          # tabs restyle, ListRow, icons (D10)
│   │   ├── Shared/MyShares.tsx       # ListRow recipe (D10)
│   │   ├── Downloads/index.tsx       # unchanged wrapper
│   │   ├── Account/index.tsx         # page header + card recipe
│   │   ├── Admin/index.tsx           # page header, card, ListRow (D10)
│   │   └── PublicShare/index.tsx     # branded public chrome (D13)
│   └── styles/
│       └── global.css                # REWRITE: token system, light+dark (D1/D2)
├── tests/                            # updated + new unit tests (D12)
e2e/tests/                            # selector/flow updates only (D12)
```

**Structure Decision**: Existing SPA structure kept; new shell pieces live beside current
components (`components/` for visual pieces, `app/` for providers), matching where
`AppLayout`/`auth`/`fileUrls` already draw that line. No backend, database, or contract
directories are touched.

## Complexity Tracking

No constitution violations — table intentionally empty.
