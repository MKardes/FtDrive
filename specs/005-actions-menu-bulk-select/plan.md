# Implementation Plan: Per-Item Details Menu & Bulk Selection

**Branch**: `005-actions-menu-bulk-select` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-actions-menu-bulk-select/spec.md`

## Summary

Replace each file/folder card's always-visible Rename/Move/Delete buttons with a single "details"
(⋮) menu, keeping Download as a separate quick action; add a toolbar "Select" mode that lets a
user check multiple cards and apply bulk Move/Delete to all of them at once, with per-item
partial-failure reporting.

**Technical approach**: **Frontend-only** — no new backend endpoint, table, or contract. Bulk
actions reuse the existing single-item `PATCH /nodes/:id` (rename/move) and `DELETE /nodes/:id`
(trash) endpoints, firing one call per selected item concurrently via `Promise.allSettled`; this
is what naturally gives FR-008's per-item partial-success reporting, without inventing a new bulk
wire format. Two structural findings from `research.md` drive the component work: `.file-card` is
currently a `<button>` wrapping the whole card, which cannot legally host the nested ⋮/checkbox
controls this feature needs, so it becomes a `<div role="button" tabIndex={0}>` with matching
keyboard handling; and any popover must render outside `.file-card`'s `overflow: hidden` (as a
sibling inside `.file-card-wrapper`, the same plain-CSS approach `.upload-list` already uses) or
it will be visually clipped. `MoveDialog` is generalized from a single `node` to a `nodes: Node[]`
list so single- and bulk-move share one folder-picker implementation.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 + Vite — unchanged from feature-001/002/003/004.

**Primary Dependencies**: None new. Existing `@tanstack/react-query` mutations/invalidation,
existing `PATCH /nodes/:id` / `DELETE /nodes/:id` endpoints, native `Promise.allSettled`.

**Storage**: N/A — no new persisted state (see `data-model.md`); bulk actions write through the
same per-item endpoints and rows single actions already use.

**Testing**: Vitest + Testing Library (`FileGrid` menu open/close/single-open-at-a-time, select-
mode checkbox behavior in place of card-open, keyboard activation on the restructured card);
Playwright E2E (`us3-organize.spec.ts` updated to open the details menu before clicking
Rename/Move/Delete; a new bulk-selection journey covering select → bulk move → bulk delete →
partial-failure reporting → selection-clears-on-navigation, at desktop and 360px).

**Target Platform**: Same as prior features — modern desktop + mobile browsers for the SPA, at
the project's two validated breakpoints (desktop width, 360px phone width). FR-004 explicitly
requires the Select toggle and per-card selection to work on touch-only phones with no hover or
right-click dependency.

**Project Type**: Web application — frontend-only change inside the existing `frontend/` SPA.

**Performance Goals**: Menu open/close and selection toggling feel instantaneous (no network
round-trip involved). Bulk actions against the largest realistic selection (a full loaded page,
50 items) complete without a client-side queue/throttle — see research.md's concurrency decision.

**Constraints**:
- No new backend endpoint, contract, or data — every action, single or bulk, goes through the
  existing authenticated, owner-scoped `PATCH`/`DELETE /nodes/:id` (Constitution I/II).
- No existing capability changes behavior — Rename/Move/Delete/Download still do exactly what
  they do today; only *how they're reached* changes (FR-002's explicit "behaving exactly as its
  existing button does today").
- Must hold at both the desktop width and the 360px minimum width already required elsewhere in
  the project (FR-011), with no two controls overlapping (SC-005) — directly continuing
  `004-ui-polish-viewer`'s overlap-elimination work rather than reintroducing the problem via new
  corner controls.
- Selection MUST be unavailable while a modal dialog is open (FR-010), mirroring how
  drag-and-drop upload is already gated the same way.

**Scale/Scope**: Same household/small-group scale as existing features; bulk actions are bounded
by what's already loaded into view (page size 50), matching the app's existing keyset-pagination
model — no attempt to represent or act on an entire folder beyond what's paginated in.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial evaluation: **PASS** — no principle touched in a new way; no new server surface, data, or
external dependency. Re-checked after design (Phase 1): still **PASS** — the concurrency and
state-lifting decisions in research.md don't change this.

| Principle | How this plan complies |
|-----------|------------------------|
| **I. Security & Authentication First** (NON-NEGOTIABLE) | No new endpoint. Every bulk-action call is the same already-authenticated `PATCH`/`DELETE /nodes/:id` a single action already uses, just issued once per selected item. |
| **II. Strict Per-User Data Isolation** (NON-NEGOTIABLE) | No new data-access path. Each per-item call is independently owner-scoped and 404s on cross-user access exactly as today; a bulk batch cannot succeed on an item it doesn't own, since nothing about ownership enforcement changes. |
| **III. Self-Hosted Data Ownership** | No new external service, library, or outbound traffic. |
| **IV. Media-First, Intuitive UI** | Directly advances this principle: declutters every card down to at most two always-visible controls and turns "delete 5 files" from 5 repeated confirmations into 1. |
| **V. Reliable Sync & Data Integrity** | Bulk Delete still routes through Trash (not permanent deletion) exactly like single delete; bulk Move still hits the same cycle-prevention check server-side per item. No new write path bypasses existing safety checks. |
| **Security & Privacy Requirements** | No change — no new outbound connection or logging surface. |
| **Development Workflow & Quality Gates** | No auth/isolation/file-access code changes, so the gating negative-test requirement isn't newly triggered; component + E2E coverage is extended per the Testing section above, including updating existing tests whose selectors the details-menu restructuring invalidates. |

## Project Structure

### Documentation (this feature)

```text
specs/005-actions-menu-bulk-select/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — structural findings + decisions, verified against current code
├── data-model.md        # Phase 1 output — transient view-state only; no new entities
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature introduces no new API endpoints or wire formats — bulk
actions are a client-side loop over the existing single-item contracts from feature-001.

### Source Code (repository root)

New and changed paths are marked; everything else is existing feature-001–004 code reused as-is.

```text
frontend/
├── src/
│   ├── styles/
│   │   └── global.css              # CHANGE: card-menu trigger/popover, select-mode checkbox,
│   │                                #   bulk-action bar, bulk-result panel; Download moved into
│   │                                #   the meta row
│   ├── components/
│   │   ├── FileGrid.tsx             # CHANGE: `.file-card` button → div[role=button]; add ⋮
│   │   │                            #   trigger + popover, select-mode checkbox; new props for
│   │   │                            #   select mode/selected ids/toggle callback
│   │   └── BulkResultPanel.tsx      # NEW: small dismissible list of per-item bulk-action failures
│   ├── features/
│   │   └── nodes/
│   │       ├── hooks.ts             # CHANGE: add useBulkMoveNodes/useBulkTrashNodes (Promise.allSettled
│   │       │                        #   over the existing single-item mutations' underlying calls)
│   │       └── dialogs.tsx          # CHANGE: MoveDialog `node: Node` → `nodes: Node[]`
│   └── pages/Browse/index.tsx       # CHANGE: lift selectMode/selectedIds state; toolbar Select
│                                     #   toggle + bulk action bar; wire FileGrid's new props;
│                                     #   bulk dialog kinds; bulkResult state/panel
└── tests/
    └── FileGrid.test.tsx            # CHANGE: menu open/close/single-open, select-mode toggling,
                                      #   keyboard activation on the restructured card

e2e/
└── tests/
    ├── us3-organize.spec.ts         # CHANGE: open the details menu before Rename/Move/Delete
    └── browse-media.spec.ts         # CHANGE: (if any existing case clicks a card action button
                                      #   directly) update to go through the details menu
    (new bulk-selection journey — file to be named in tasks phase)
```

**Structure Decision**: Reuse the established feature-001/003/004 frontend layout. The one new
file (`BulkResultPanel.tsx`) is small and single-purpose; everything else is a change to a file
that already owns the relevant concern (`FileGrid` for card rendering, `Browse` for view state,
`dialogs.tsx` for the reusable move/confirm dialogs, `global.css` for layout). No new backend
directory, endpoint, or shared abstraction beyond generalizing `MoveDialog`, which already exists.

## Complexity Tracking

*No entries — Constitution Check reported no violations. Three candidate complexity sources (a
new bulk backend endpoint; a portal-based popover; a client-side concurrency-limiting queue for
bulk actions) were considered in research.md and rejected in favor of simpler alternatives that
fully satisfy the spec's requirements.*
