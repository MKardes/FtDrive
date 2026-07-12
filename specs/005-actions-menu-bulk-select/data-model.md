# Phase 1 Data Model: Per-Item Details Menu & Bulk Selection

## No new persisted entities

This feature adds no database tables, columns, migrations, or new API request/response shapes.
It reuses the existing **`Node`** entity and the existing single-item endpoints
(`PATCH /nodes/:id`, `DELETE /nodes/:id`), calling them once per selected item instead of once
per user click.

## Transient client-side view state (not persisted)

### Selection (`Browse`)

Matches the spec's Key Entities section: exists only for the lifetime of viewing one folder or
search result set; never saved, shared, or visible to any other user or session.

| Field | Type | Meaning |
|-------|------|---------|
| `selectMode` | `boolean` | Whether the toolbar's "Select" toggle is on. Controls whether cards render checkboxes and respond to taps by toggling selection instead of opening. |
| `selectedIds` | `Set<string>` | IDs of currently-selected items within `items` (the same array `Browse` already builds from `useChildren`/`useSearch`). |

Derived, never stored separately:

- `selectedNodes = items.filter((n) => selectedIds.has(n.id))` — used to build bulk-action dialog
  titles/messages and the `MoveDialog`'s `nodes` prop.
- `selectedCount = selectedIds.size` — shown in the bulk-action bar.

State transitions:

```text
selectMode = false, selectedIds = {}
  --toggle Select on--> selectMode = true

selectMode = true
  --tap a card--> toggle that id in selectedIds
  --toggle Select off--> selectMode = false, selectedIds = {}
  --navigate to another folder / start a search--> selectMode unchanged*, selectedIds = {}
  --bulk action completes--> selectedIds = {} (selectMode unchanged, per research.md)
```

\* FR-009 requires selection to clear on navigation/search; it does not require the toggle itself
to turn off, so `selectMode`'s own value survives a clear of `selectedIds`. In practice this
means arriving in a new folder with Select mode already on immediately shows checkboxes again,
starting from an empty selection — consistent with "unavailable while a dialog is open" (FR-010)
being the only condition that actually disables the *toggle*.

### Open details menu (`FileGrid`, local — not lifted to `Browse`)

| Field | Type | Meaning |
|-------|------|---------|
| `openMenuId` | `string \| null` | The id of the card whose details menu (Rename/Move/Delete) is currently open, or `null`. Local to `FileGrid`; `Browse` never reads or sets it. |

Transitions: opening card A's menu sets `openMenuId = A.id`; opening card B's menu while A's is
open replaces it (`openMenuId = B.id`), which is what "only one menu open at a time" (FR-003)
means in practice — there is only one slot. Outside click, Escape, choosing a menu action, or
turning on Select mode all reset it to `null`.

### Bulk action result (`Browse`)

| Field | Type | Meaning |
|-------|------|---------|
| `bulkResult` | `{ failed: Array<{ id: string; name: string; message: string }> } \| null` | Set once a bulk Move/Delete batch settles, if and only if at least one item failed. `null` clears the panel (dismissed by the user, or a new bulk action starts). |

Not derived from anything else — this is the one piece of genuinely new state, since it's the
only place a batch's mixed per-item outcomes need to be remembered long enough to display them
(everything else in this feature is either reused endpoint data or a simple selection set).
