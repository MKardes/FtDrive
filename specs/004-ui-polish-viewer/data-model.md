# Phase 1 Data Model: UI Layout Polish & Viewer Enhancement

## No new persisted entities

This feature adds no database tables, columns, migrations, or API request/response shapes. It
is a CSS/layout fix plus one small piece of derived, transient view state. It reuses:

- The existing **`Node`** entity and **`NodePage`** pagination shape — unchanged. Nothing here
  reads or writes anything not already fetched today.
- The existing carousel-navigation state introduced by `003-drag-drop-carousel-nav`
  (`previewIndex`, `items`, `hasPrev`/`hasNext`) in `frontend/src/pages/Browse/index.tsx` — this
  feature only *reads* two more values out of state that already exists, it does not change how
  that state is produced.

## Transient client-side view state (not persisted)

### Position-in-set indicator (`Browse` → `Preview` → viewers)

| Field | Type | Meaning |
|-------|------|---------|
| `position` | `{ index: number; total: number } \| undefined` | 1-based display position of the currently open item within the current `items` array, and the total count known so far. `undefined` when there is no meaningful "set" (e.g. exactly one previewable item), so no indicator renders. |

Derived, never stored, computed the same way `hasPrev`/`hasNext` already are:

- `position = previewIndex !== null && items.length > 1 ? { index: previewIndex + 1, total: items.length } : undefined`
- `total` reflects only what's been loaded so far (matching how `hasNext` already accounts for
  `active.hasNextPage` separately) — it is **not** a claim about the folder's true total item
  count, since keyset pagination never fetches that. The label reads as "n of total-loaded",
  which is accurate and avoids a new counting endpoint.

This extends `PreviewNavProps` (`frontend/src/components/Preview.tsx`), the same props object
`onPrev`/`onNext`/`hasPrev`/`hasNext` already travel through into `PhotoViewer`/`VideoPlayer`.

### No other new state

The remaining fixes (file-grid card sizing, upload-row spacing, viewer backdrop opacity, media
min-size) are pure CSS changes with no accompanying state — they change how already-existing
data renders, not what data exists or flows through the app.
