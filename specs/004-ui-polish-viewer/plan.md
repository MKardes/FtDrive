# Implementation Plan: UI Layout Polish & Viewer Enhancement

**Branch**: `004-ui-polish-viewer` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-ui-polish-viewer/spec.md`

## Summary

Fix two confirmed overlap defects (file/folder cards colliding in the browse grid; carousel
nav controls sitting on top of full-screen photo/video content), tidy up the upload-progress
list's spacing, and improve the video viewer's use of screen space and set-position awareness.

**Technical approach**: This is a **frontend-only** CSS/markup fix plus one small piece of
threaded-through view state — no backend, schema, or contract changes. Each defect was
reproduced against the running dev app and root-caused before writing this plan (see
`research.md`): the grid overlap is a missing `width: 100%` on the `.file-card` button that lets
it fit-content-size past its own grid cell; the upload-row squeeze is four CSS classes
(`.file-card-wrapper`, `.uploader`, `.upload-list`, `.upload-row`, `.upload-row__name`) that were
never given any rule at all; the viewer-control overlap is nav buttons positioned from the
viewport edge with nothing tying them to the media's own rendered bounds. All four are fixed in
`frontend/src/styles/global.css`, following patterns the codebase already uses elsewhere (e.g.
`.list-row`'s existing flex+wrap treatment). The video-viewer enhancements (min-size scaling,
"n of total" indicator) extend `PreviewNavProps` the same way feature 003 already threads
`hasPrev`/`hasNext` through `Preview` into `PhotoViewer`/`VideoPlayer`.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 + Vite — unchanged from feature-001/002/003.

**Primary Dependencies**: None new. Pure CSS (`global.css`) plus existing React state already
computed in `Browse` (feature 003's `previewIndex`/`items`).

**Storage**: N/A — no new persisted state (see `data-model.md`).

**Testing**: Vitest + Testing Library component tests (FileGrid card-width regression check,
Uploader row spacing/structure, viewer position-indicator rendering); Playwright E2E extends
existing browse/upload/viewer journeys with a long-name fixture and a 360px-viewport bounding-
box overlap assertion, mirroring the manual measurement approach used during this feature's own
investigation.

**Target Platform**: Same as prior features — modern desktop + mobile browsers for the SPA, with
the project's two validated breakpoints (typical desktop width, 360px phone width).

**Project Type**: Web application — frontend-only change inside the existing `frontend/` SPA.

**Performance Goals**: No measurable performance change expected — these are layout/paint-level
CSS fixes and one extra derived (not fetched) value; no new network calls or re-render loops are
introduced.

**Constraints**:
- Must not touch the backend, any API contract, or any data the frontend doesn't already fetch
  (Constitution III/Simplicity) — confirmed achievable: every defect's fix lives in CSS or in
  values `Browse` already computes.
- Must not regress any existing capability (FR-012 / upload, download, rename, move, delete,
  search, navigation, trash, carousel nav from feature 003) — fixes are scoped to sizing/spacing/
  positioning rules and one additive prop, not behavioral rewrites.
- Must hold at both the desktop width and the 360px minimum width already required elsewhere in
  the project (FR-011).

**Scale/Scope**: Same household/small-group scale as existing features. No change to how many
items load or how pagination behaves — only how already-rendered items are laid out.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial evaluation: **PASS** — no principle touched in a new way; no new server surface, data,
dependency, or external service. Re-checked after design (Phase 1): still **PASS**, unchanged —
the position-indicator addition only threads an already-computed count through existing props.

| Principle | How this plan complies |
|-----------|------------------------|
| **I. Security & Authentication First** (NON-NEGOTIABLE) | No new endpoint, input, or auth surface. All fixes render data the already-authenticated listing/upload calls returned. |
| **II. Strict Per-User Data Isolation** (NON-NEGOTIABLE) | No new data access path. The position indicator reads only the same owner-scoped `items` array `Browse` already holds; nothing crosses a user boundary. |
| **III. Self-Hosted Data Ownership** | No new external service, library, or outbound traffic — CSS and existing React state only. |
| **IV. Media-First, Intuitive UI** | Directly advances this principle: fixes the two defects that most undermine "effortless browsing" (overlapping cards, obstructed media) and makes the video viewer itself easier to actually watch. |
| **V. Reliable Sync & Data Integrity** | Not implicated — no write path is touched. |
| **Security & Privacy Requirements** | No change — no new outbound connection or logging surface. |
| **Development Workflow & Quality Gates** | No auth/isolation/file-access code changes, so the gating negative-test requirement is not newly triggered; component + E2E coverage is extended per the Testing section above. |

## Project Structure

### Documentation (this feature)

```text
specs/004-ui-polish-viewer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — root-cause findings, verified live against the app
├── data-model.md         # Phase 1 output — no new entities; documents the one derived view-state field
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature introduces no new API endpoints or wire formats.

### Source Code (repository root)

New and changed paths are marked; everything else is existing feature-001/002/003 code reused
as-is.

```text
frontend/
├── src/
│   ├── styles/
│   │   └── global.css             # CHANGE: .file-card width fix; .file-card-wrapper/.uploader/
│   │                               #   .upload-list/.upload-row/.upload-row__name rules; viewer
│   │                               #   backdrop opacity; media min-size; nav-button gutter
│   ├── components/
│   │   ├── FileGrid.tsx            # unchanged: the fix is CSS-only, no markup change needed
│   │   ├── Uploader.tsx            # unchanged: same reasoning — existing markup, new CSS
│   │   ├── Preview.tsx             # CHANGE: extend PreviewNavProps with `position`; forward it
│   │   ├── PhotoViewer.tsx         # CHANGE: render position label in the existing top bar area
│   │   └── VideoPlayer.tsx         # CHANGE: same position label
│   └── pages/Browse/index.tsx      # CHANGE: compute `position` from existing previewIndex/items
└── tests/
    └── (component tests for FileGrid width, Uploader row structure, viewer position label)

e2e/
└── tests/
    └── browse-media.spec.ts        # CHANGE: add long-name fixture + 360px overlap assertions
```

**Structure Decision**: Reuse the established feature-001/003 frontend layout. Every fix lands
in files that already own the relevant concern (`global.css` for layout/spacing, `Browse` for
view state, the viewer components for rendering it) — no new component or abstraction is
introduced, matching the proportionally small, defect-fix nature of this change.

## Complexity Tracking

*No entries — Constitution Check reported no violations and no added complexity. Two candidate
complexity sources (JS-measured media sizing instead of CSS min/max; auto-hide-on-idle title bar)
were considered in research.md and rejected in favor of simpler alternatives that satisfy the
same requirements.*
