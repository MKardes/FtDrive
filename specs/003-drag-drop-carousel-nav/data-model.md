# Phase 1 Data Model: Drag-and-Drop Uploads & Media Carousel Navigation

## No new persisted entities

This feature adds no database tables, columns, or migrations, and no new API request/response
shapes. It reuses:

- The existing **`Node`** entity (`frontend/src/api/types.ts`, `backend/src/db/schema.ts`) —
  unchanged. Drag-and-drop produces `Node` rows exactly like button-initiated uploads; carousel
  navigation only reads `Node[]` already fetched for display.
- The existing **`NodePage`** keyset-pagination shape (`items` + `nextCursor`) returned by
  `listChildren`/`search` — unchanged.

## Transient client-side view state (not persisted)

Both stories introduce state that lives only in React component memory for the lifetime of the
Browse page/viewer, and is not sent to or stored by the server:

### Drop-zone state (`DropZone` / `Browse`)

| Field | Type | Meaning |
|-------|------|---------|
| `isDraggingOver` | `boolean` | Whether a file-carrying drag is currently over the drop target; drives the hover/highlight visual cue (Acceptance Scenario 2). Reset on `dragleave`, `drop`, and drag end. |

This is derived purely from native `DragEvent`s (`dragenter`/`dragover`/`dragleave`/`drop`) and
`event.dataTransfer.types.includes('Files')` to distinguish real file drags from other drag
sources (e.g., dragged text), per FR-005.

### Carousel navigation state (`Browse`)

| Field | Type | Meaning |
|-------|------|---------|
| `previewIndex` | `number \| null` | Index into the current `items: Node[]` array of the file open in the full-screen viewer; `null` means the viewer is closed. Replaces the current `preview: Node \| null` field. |

Derived values, recomputed on each render from `previewIndex` and the live `items`/pagination
state (never stored separately, so they can't drift out of sync with what's actually loaded):

- `previewNode = previewIndex !== null ? items[previewIndex] : null`
- `hasPrev = previewIndex !== null && previewIndex > 0`
- `hasNext = previewIndex !== null && (previewIndex < items.length - 1 || active.hasNextPage)`
- `onNext`: if `previewIndex === items.length - 1` and `active.hasNextPage`, await
  `active.fetchNextPage()` first (FR-010), then increment `previewIndex`.
- `onPrev`: decrement `previewIndex` (only enabled when `hasPrev`).

### State transitions

```text
closed (previewIndex = null)
  --openNode(node) [node.type === 'file']--> open at index of `node` in `items`

open at index i
  --onNext (hasNext)--> open at index i+1  (fetch-next-page first if i was the last loaded item)
  --onPrev (hasPrev)--> open at index i-1
  --Escape / backdrop click--> closed (previewIndex = null)
```

No transition wraps `i` past the array bounds (FR-008); when only one previewable item exists,
`hasPrev`/`hasNext` are both false from the start (FR-011) so no controls render.
