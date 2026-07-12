# Phase 0 Research: Per-Item Details Menu & Bulk Selection

No `[NEEDS CLARIFICATION]` markers remain in the spec (both were resolved with the user during
`/speckit-clarify` before planning). This phase records the technical decisions behind the plan,
verified against the actual current code rather than assumed.

## Finding: `.file-card` is a `<button>` wrapping everything — it cannot host nested controls

- **Current code** (`frontend/src/components/FileGrid.tsx`): the entire card — thumbnail, name,
  and meta — is one `<button type="button" className="file-card" onClick={...}>`.
- **Problem**: HTML forbids interactive content (another `<button>`, a checkbox `<input>`) inside
  a `<button>`'s content model. A nested details-menu trigger (⋮) and a select-mode checkbox
  cannot be placed inside the existing `.file-card` button without invalid markup and unreliable
  click/focus behavior across browsers.
- **Decision**: change `.file-card` from a `<button>` to a `<div role="button" tabIndex={0}>`
  that keeps the exact same click behavior (`onClick={() => onOpen(node)}`) plus an `onKeyDown`
  handler firing on `Enter`/`Space` (the two activation keys a real `<button>` gives for free),
  preserving keyboard accessibility. This frees the card to contain real nested `<button>`
  elements for the menu trigger and the checkbox, each calling `e.stopPropagation()` so clicking
  them doesn't also trigger the card's own open action.
- **Alternatives considered**: keep `.file-card` a `<button>` and place the menu
  trigger/checkbox as siblings positioned on top of it via CSS — rejected: still invalid to
  nest interactive elements structurally is avoided, but overlapping click targets are exactly
  the class of bug `004-ui-polish-viewer` just finished eliminating; a sibling-not-overlapping
  layout only works if those siblings live *outside* the button's box, which the corner-badge
  design this feature calls for doesn't allow.

## Finding: any popover must render outside `.file-card`'s `overflow: hidden`

- `.file-card` (`global.css`) sets `overflow: hidden` (needed to clip thumbnail images to the
  card's rounded corners). A details-menu popover rendered *inside* `.file-card` would be
  visually clipped at the card's edge instead of floating above the grid.
- **Decision**: render the popover as a sibling of `.file-card`, inside `.file-card-wrapper`
  (which has no `overflow` rule), absolutely positioned relative to the wrapper — the same
  plain-CSS, no-portal, no-library approach `.upload-list` already uses successfully
  (`004-ui-polish-viewer`). No new dependency needed.
- **Alternatives considered**: a portal to `document.body` (e.g., via `createPortal`) — rejected;
  the codebase has no existing portal usage and the simpler sibling-popover approach already
  works for `.upload-list`, so introducing a new pattern isn't justified (Simplicity principle).

## Finding: no existing test infrastructure targets a details menu — call sites must be updated

- `frontend/tests/FileGrid.test.tsx`, `e2e/tests/us3-organize.spec.ts`, and `browse-media.spec.ts`
  currently do `fileCard.getByRole('button', { name: 'Rename' }).click()` directly on the card —
  they assume the button is always visible.
- **Decision**: these are genuine required updates (open the details menu first, then click the
  action inside it), not new ambiguity — tracked as explicit tasks in the tasks phase rather than
  spec changes, since the *behavior* they test (rename/move/delete still work) is unchanged, only
  how it's reached.

## Decision: bulk actions loop the existing single-item endpoints client-side — no new backend surface

- **Decision**: `PATCH /nodes/:id` (rename/move) and `DELETE /nodes/:id` (trash) already exist,
  are already authenticated and owner-scoped, and already return per-item errors (404/409). Bulk
  Move and bulk Delete fire one call per selected item concurrently via `Promise.allSettled`,
  reusing these exact endpoints — no new endpoint, request/response shape, or contract.
- **Rationale**: FR-008 requires partial success (some items succeed, others fail, independently
  reported) — this is naturally what per-item `Promise.allSettled` gives for free. A single new
  "bulk" backend endpoint would need to invent its own partial-failure response shape and
  transaction semantics for no behavioral gain, which the Simplicity principle and this app's
  household/small-group scale don't justify. This also matches the frontend-only precedent set by
  features 002–004: every prior UI-facing feature reused existing authenticated, isolated
  endpoints rather than adding new server surface.
- **Concurrency**: no client-side throttling — all selected items' requests fire at once. At this
  app's scale (page size 50, so at most ~50 concurrent requests for a "select everything loaded"
  action), this is well within what the existing single-user-facing backend already handles for
  concurrent uploads; revisit only if real usage shows contention.
- **Alternatives considered**: a new `POST /nodes/bulk-move` / `POST /nodes/bulk-delete` endpoint
  — rejected per the reasoning above; a client-side queue with a concurrency cap (mirroring the
  download worker pool's 5-per-user cap) — rejected as unneeded complexity for interactive,
  human-initiated batches of this size (versus the download pipeline's long-running background
  jobs, which is why *that* pipeline needed a cap and this doesn't).

## Decision: where state lives

- **`selectMode: boolean` and `selectedIds: Set<string>`** are lifted into `Browse`
  (`frontend/src/pages/Browse/index.tsx`), alongside the existing `previewIndex`/`dialog`/`query`
  state it already centralizes — because the toolbar's "Select" toggle and bulk-action bar (both
  rendered by `Browse`) need to read and drive them, the same reason `dialog` already lives there
  instead of in a child.
- **Which card's details menu is open** stays local state inside `FileGrid`
  (`openMenuId: string | null`) — it never needs to be read or driven from `Browse`; it only
  needs to invoke the same per-item action callbacks `Browse` already passes down today.
- **Alternatives considered**: lifting the open-menu id to `Browse` too — rejected as
  unnecessary; nothing outside `FileGrid` needs to know which menu is open, so lifting it would
  only add prop-threading with no benefit (mirrors feature 003's data-model.md reasoning for
  keeping `isDraggingOver` local to `DropZone`).

## Decision: generalize `MoveDialog` from one node to a list, instead of duplicating it

- **Decision**: change `MoveDialog`'s prop from `node: Node` to `nodes: Node[]`. Existing
  single-item call sites pass `[node]` (no behavior change — title/exclusion logic reduces to
  today's single-item case when the array has one element). Bulk call sites pass every selected
  node; the destination folder-picker excludes all of their ids from its listing (so a selected
  folder can't be chosen as its own or a sibling selected folder's destination at the picker
  level — the deeper "can't move into your own descendant" rule remains enforced server-side per
  item, exactly as it is today).
- **Alternatives considered**: a separate `BulkMoveDialog` component duplicating the folder-picker
  UI — rejected; the two dialogs would need to stay in lockstep on every future folder-picker
  change for no reason, violating the "three similar lines is better than a premature
  abstraction" guidance in the opposite direction (here, the abstraction already exists and is
  cheap to generalize, so *not* sharing it would be the premature duplication).
- `ConfirmDialog` needs no change — it already takes a generic `title`/`message`, so bulk delete
  just passes a count-aware message (`"3 items will be moved to Trash…"`) the same way single
  delete does today.

## Decision: Download quick action moves to the card's meta row, not a top corner

- The user's request explicitly places the three-dot details trigger at the "top right of an
  object." Clarification Q1 kept Download as a separate always-visible control. Placing two
  independent interactive controls in the same corner re-creates exactly the kind of
  overlap/crowding risk `004-ui-polish-viewer` was built to eliminate (SC-005 here explicitly
  re-asserts "no two controls overlap" at 360px).
- **Decision**: keep the details trigger (⋮) at the top-right corner as requested; place the
  select-mode checkbox at the top-left corner (only rendered while Select mode is on, so it never
  competes with anything today); move the Download quick action down into the existing
  `.file-card__meta` row (where file size already renders, for files only, so there's no
  competing folder case) as a small icon-button beside the size text — reusing space that already
  exists rather than the crowded top edge.
- **Alternatives considered**: keeping Download in a top corner alongside the details trigger —
  rejected for the overlap-risk reason above; a single combined "quick actions" corner with both
  Download and the menu trigger stacked — rejected as needlessly cramped when the meta row
  already has free horizontal space today.

## Decision: bulk partial-failure reporting is a small inline summary, not a new dialog/toast system

- **Decision**: after a bulk action settles, if any item failed, show a small dismissible panel
  (reusing the existing `.card`/`.error-text` visual language already used elsewhere) listing
  each failed item's name and reason. Fully successful batches show nothing extra — consistent
  with how single-item success already behaves today (the item simply disappears/moves; no
  success toast exists anywhere in the app to be consistent with).
- **Alternatives considered**: a toast/notification library — rejected, no such dependency exists
  in the app today and one component's worth of inline UI doesn't justify adding one.

## Decision: selection clears after a bulk action completes; Select mode itself does not turn off

- Per FR-009, only an explicit toggle-off, folder navigation, or starting a search clears
  selection. A completed bulk action isn't listed as a trigger in the spec, but leaving succeeded
  items "selected" is meaningless once they're gone (moved/trashed) — so `selectedIds` resets to
  empty after the batch settles, while `selectMode` (whether the toggle itself is on) is left
  exactly as the user set it, letting them keep selecting more items without re-opening Select
  mode. This is a plan-level implementation default, not a spec change, and doesn't conflict with
  any acceptance scenario.
