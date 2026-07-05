# Implementation Plan: Drag-and-Drop Uploads & Media Carousel Navigation

**Branch**: `003-drag-drop-carousel-nav` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-drag-drop-carousel-nav/spec.md`

## Summary

Let a signed-in user drop files from their OS directly onto the folder view to upload them, and
let them step left/right through the current folder's (or search results') files from inside the
full-screen photo/video viewer instead of closing it to pick the next item.

**Technical approach**: Both stories are **frontend-only** additions layered on existing,
already-authenticated, already-isolated primitives — no backend or schema changes.
Drag-and-drop wires native HTML5 `dragenter`/`dragover`/`drop` handlers onto the `Browse` page's
content area, which call the *same* `useUploader().add()` used by the existing "Upload" button
(`Uploader.tsx` / `features/upload/hooks.ts`), so progress, retry, and "kept both" collision
handling are reused unchanged, not reimplemented. Carousel navigation lifts the currently-open
item's *index* into the already-materialized `items` array that `Browse` builds from
`useChildren`/`useSearch` (both TanStack Query `useInfiniteQuery`, exposing `hasNextPage` /
`fetchNextPage`), and threads `onNext`/`onPrev`/`hasNext`/`hasPrev` props through `Preview` into
`PhotoViewer`/`VideoPlayer`, which already own an Escape-key listener that ArrowLeft/ArrowRight
handling extends. No new API endpoints, tables, or contracts are introduced.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 + Vite — unchanged from feature-001/002.

**Primary Dependencies**: Existing only — `@tanstack/react-query` (infinite queries already power
pagination), native browser Drag and Drop API (`DataTransfer`/`FileList`), native `KeyboardEvent`.
No new runtime dependency.

**Storage**: N/A — no new persisted state. Drag-and-drop uploads go through the existing
`POST` upload endpoint; navigation position is transient React component state, not persisted.

**Testing**: Vitest + Testing Library component tests for drop-zone behavior (file drop, non-file
drag ignored, disabled while searching/dialog-open) and for carousel navigation (arrow
click/keydown, boundary disable, video-stops-on-navigate, auto-load-next-page); Playwright E2E
(`e2e/tests/`) extends the existing Browse/upload journeys with a drag-drop upload case and a
multi-item arrow-navigation case.

**Target Platform**: Same as feature-001/002 — modern desktop + mobile browsers for the SPA. OS
drag-and-drop of files is a desktop-browser interaction; touch devices keep the existing tap-based
"Upload" button plus on-screen carousel arrows (FR-007), so no platform gap is introduced.

**Project Type**: Web application — frontend-only change inside the existing `frontend/` SPA.

**Performance Goals**: Drop-to-queued feedback and arrow-to-next-item transitions both feel
instantaneous for already-loaded content (SC-001/SC-004, target < 300ms perceived latency), matching
the existing click-to-upload and open-preview interactions.

**Constraints**:
- Reuses the existing authenticated, per-user-scoped upload and listing endpoints as-is — this
  feature adds no new server surface, so it inherits their auth/isolation guarantees rather than
  needing new ones (Principles I/II).
- Drag-and-drop MUST be inert (no upload) while search results are shown or a modal dialog is
  open, mirroring the existing button-based uploader's availability (FR-004/FR-006).
- Navigation MUST NOT wrap around and MUST hide/disable controls at the ends and when only one
  previewable item exists (FR-008/FR-011).
- No shell/process/file-system code is touched; this is UI event wiring only.

**Scale/Scope**: Same household/small-group scale as existing features; navigation must stay
responsive across folders with hundreds of items via the existing keyset pagination, loading
further pages on demand as the user arrows past what's loaded (FR-010).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial evaluation: **PASS** — no principle touched in a new way; the feature reuses existing
authenticated/isolated endpoints and adds no server surface, storage, or external dependency.

| Principle | How this plan complies |
|-----------|------------------------|
| **I. Security & Authentication First** (NON-NEGOTIABLE) | No new endpoint is introduced. Dropped files go through the existing authenticated upload call exactly as button-initiated uploads do today; no new input-validation surface beyond what the existing uploader already handles. |
| **II. Strict Per-User Data Isolation** (NON-NEGOTIABLE) | Drag-and-drop uploads target only the currently open (already access-checked) folder; carousel navigation only walks the array already returned by the existing owner-scoped `listChildren`/`search` calls — no new cross-user surface is created. |
| **III. Self-Hosted Data Ownership** | No new external service, library, or outbound traffic; both stories are client-side event handling around existing local calls. |
| **IV. Media-First, Intuitive UI** | Directly advances this principle: removes a click for the most common action (upload) and turns single-item preview into continuous browsing for photos/videos — the two UI gaps the constitution calls out (upload, preview) explicitly. |
| **V. Reliable Sync & Data Integrity** | Drag-and-drop uploads flow through the same per-file upload call, so the existing atomic finalize / kept-both collision handling applies unchanged; no new write path is introduced. |
| **Security & Privacy Requirements** | No change — no new outbound connection, no new logging surface. |
| **Development Workflow & Quality Gates** | No auth/isolation/file-access code changes, so the gating negative-test requirement is not newly triggered; existing component/E2E test suites are extended per the Testing section above. |

## Project Structure

### Documentation (this feature)

```text
specs/003-drag-drop-carousel-nav/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — no new entities; documents view-state shape
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature introduces no new API endpoints or wire formats — it
reuses the existing upload (`POST` file content) and listing (`listChildren`/`search`) contracts
from feature-001 unchanged.

### Source Code (repository root)

New and changed paths are marked; everything else is existing feature-001/002 code reused as-is.

```text
frontend/
├── src/
│   ├── components/
│   │   ├── Uploader.tsx           # unchanged: exposes the same add()-driven upload list UI
│   │   ├── Preview.tsx            # CHANGE: accept + forward nav props (onNext/onPrev/hasNext/hasPrev) to the right viewer
│   │   ├── PhotoViewer.tsx        # CHANGE: render prev/next controls; extend keydown handler for ArrowLeft/ArrowRight
│   │   ├── VideoPlayer.tsx        # CHANGE: same nav controls; stop playback before switching item
│   │   └── DropZone.tsx           # NEW: drag event wrapper (enter/over/leave/drop) around the folder view, visual cue, reuses useUploader().add()
│   ├── features/
│   │   └── upload/hooks.ts        # unchanged: useUploader().add() already accepts FileList (drop event's dataTransfer.files)
│   └── pages/Browse/index.tsx     # CHANGE: wrap grid in DropZone (disabled while searching/dialog open); track preview index into `items`; pass nav props to Preview; fetchNextPage() when navigating past loaded items
└── tests/
    └── (component tests for DropZone, PhotoViewer/VideoPlayer navigation)

e2e/
└── tests/
    └── browse-media.spec.ts       # NEW: drag-drop upload case + multi-item arrow navigation case
```

**Structure Decision**: Reuse the established feature-001 frontend layout; no backend directories
are touched. The drop-target behavior is isolated into one new small component (`DropZone`) rather
than duplicated inline in `Browse`, and the two viewer components gain shared-shape navigation
props rather than a new abstraction, keeping the change proportional to two UI-only user stories.

## Complexity Tracking

*No entries — Constitution Check reported no violations and no added complexity beyond normal UI
wiring.*
