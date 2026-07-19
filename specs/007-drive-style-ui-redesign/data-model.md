# Data Model: Drive-Style UI Redesign (007)

**No new server-side entities.** This feature adds zero tables, columns, endpoints or wire
formats (plan.md, Constitution check). All state introduced is client-side view/preference
state.

## Persisted client preferences (localStorage)

| Key | Values | Default (absent) | Written by | Read by |
|-----------------------|----------------------|--------------------------|--------------------------|---------------------------------------|
| `ftdrive:theme` | `'light'` \| `'dark'` | follow device preference | `ThemeProvider.setTheme` | pre-paint script (`index.html`), `ThemeProvider` |
| `ftdrive:viewMode` | `'grid'` \| `'list'` | `'grid'` | Browse view toggle | Browse |

Rules:

- `ftdrive:theme` absent ⇒ "system": no `data-theme` attribute is stamped and the
  `prefers-color-scheme` media block decides; choosing Light/Dark stamps the attribute and
  writes the key; choosing "System" removes the key and attribute (FR-009).
- Values are validated on read; anything unrecognized is treated as absent (defensive
  against manual edits).
- Both preferences are per-browser by design (spec: Key Entities) — no server roaming.

## Transient view state (React state, never persisted)

| State | Owner | Purpose / rules |
|--------------------|----------------|-----------------------------------------------------------------|
| `drawerOpen` | `AppLayout` | Off-canvas sidebar under 900px; closes on navigate, scrim tap, Escape (spec Edge Cases). |
| `userMenuOpen` | `UserMenu` | Avatar popover; closes on outside click, Escape, action. |
| `newMenuOpen` | `Sidebar` | "New" popover; closes on outside click, Escape, action. |
| `menuPlacement` | popover owners | Result of `menuPosition.ts` measurement (`up`/`down`, `left`/`right` alignment) computed at open (FR-012, D9). |
| `viewMode` | `Browse` | Mirror of `ftdrive:viewMode`, initialized from localStorage, written through on toggle (FR-004). |
| shell actions | `ShellActionsContext` | `{ newFolder, uploadFiles, downloadFromWeb } \| null`; registered by Browse on mount (per current folder), unregistered on unmount. New button disabled while `null` (D6). |
| search query `q` | URL (`/search?q=`) | Replaces Browse's local `query` state; typing performs replace-navigation, clearing returns to `/` (D5). Selection is cleared on change, as today. |

Existing transient state (previewIndex, selection set, dialog discriminated union, upload
queue, crumbs-in-location-state) is **unchanged** — the redesign renders it differently but
does not restructure it.

## Invariants preserved

- `items[]` order (server: folders first, then files, name ASC) remains the single source
  for both display and carousel indexing; grid sectioning only partitions the same array
  without reordering (research.md D8).
- Theme attribute (`data-theme`) is the single CSS source of truth; React state mirrors it,
  never the reverse direction except at initialization.
- No component reads another route's transient state; cross-shell wiring goes only through
  the two new providers (`theme`, `shellActions`).
