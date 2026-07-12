# Quickstart: Per-Item Details Menu & Bulk Selection

Validates the two user stories against a running dev instance. Assumes the feature-001 dev setup
already works (see `specs/001-personal-cloud-drive/quickstart.md`).

## Prerequisites

- Backend running (`npm run dev:backend`) and frontend dev server running (`npm run
  dev:frontend`).
- A folder containing 4+ files/folders, so bulk actions have something to select.

## Scenario 1: Details menu replaces always-visible action buttons (User Story 1, P1)

1. Open a folder with several items.
   - **Expect**: each card shows its thumbnail, name, a Download quick action (files only, near
     the size text), and one small details (⋮) control in the top-right corner — no separate
     always-visible Rename/Move/Delete buttons.
2. Click the details control on one item.
   - **Expect**: a menu opens showing Rename, Move, Delete.
3. Choose Rename.
   - **Expect**: the same rename dialog as today appears; renaming behaves identically.
4. Reopen the details menu on the same or a different item, then click outside the menu.
   - **Expect**: the menu closes with no action taken.
5. Reopen a menu, then press Escape.
   - **Expect**: same — closes with no action.
6. Open one card's menu, then open a different card's menu without closing the first.
   - **Expect**: the first menu closes automatically; only the second is open.
7. Repeat steps 1–3 while viewing search results instead of a folder.
   - **Expect**: same behavior — the details menu works on search results too (FR-012).
8. Repeat step 1 at a 360px-wide viewport.
   - **Expect**: the Download quick action and the details control never overlap each other or
     any other card element.

## Scenario 2: Bulk select, move, and delete (User Story 2, P2)

1. In a folder with 4+ items, open the "New folder" dialog, then try to find/use the Select
   toggle.
   - **Expect**: the Select toggle is unavailable (disabled or hidden) while the dialog is open.
2. Close the dialog, then turn on Select mode from the toolbar.
   - **Expect**: each card now shows a checkbox; clicking a card toggles its checkbox instead of
     opening it.
3. Select 3 items.
   - **Expect**: a bulk action bar appears showing "3 selected" plus Move and Delete actions.
4. Apply bulk Delete.
   - **Expect**: one confirmation naming "3 items" appears; confirming moves all 3 to Trash and
     they disappear from the folder.
5. Select 2 remaining items and apply bulk Move to a different folder.
   - **Expect**: a folder picker (like today's single-item Move) opens; confirming moves both
     items there, subject to the same cycle-prevention rule as a single move.
6. Select 2+ items where at least one has since been deleted by another means (e.g., delete it
   directly via its own details menu first, then select it — or simulate by deleting it via the
   API mid-selection) and apply a bulk action.
   - **Expect**: the still-valid items succeed; a small summary reports the specific failed
     item(s) by name and reason, without blocking or reverting the successful ones.
7. With items selected, navigate to a different folder, or start a search.
   - **Expect**: the selection clears (checkboxes reset) — confirm by turning Select mode back on
     in the new context and seeing nothing pre-selected.
8. Turn Select mode off.
   - **Expect**: checkboxes and the bulk action bar disappear; cards behave exactly as in
     Scenario 1 again.
9. Repeat steps 2–4 at a 360px-wide viewport.
   - **Expect**: the Select toggle, checkboxes, and bulk action bar never overlap any card
     content or each other.

## Automated coverage

- Component tests (Vitest + Testing Library): `FileGrid` renders exactly one details trigger per
  card and no always-visible Rename/Move/Delete buttons; opening one card's menu and then another
  closes the first; Escape/outside-click closes an open menu; in select mode, clicking a card
  toggles a checkbox instead of calling `onOpen`.
- Playwright E2E: extends `us3-organize.spec.ts` (open the details menu before clicking
  Rename/Move/Delete, since they're no longer directly on the card) and adds a new bulk-selection
  journey covering select → bulk move → bulk delete → partial-failure reporting → selection
  clearing on navigation, at both desktop and 360px viewports.
