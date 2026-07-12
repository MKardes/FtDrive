# Feature Specification: Per-Item Details Menu & Bulk Selection

**Feature Branch**: `005-actions-menu-bulk-select`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Replace the always-visible per-item Rename/Move/Delete/Download action buttons on each file/folder card with a compact "details" menu (a small three-dot button in the top-right corner of each card) that opens a menu with those actions. Also add multi-select so users can select several files/folders and apply bulk actions (e.g. move, delete) to all of them at once."

## Clarifications

### Session 2026-07-05

- Q: Does the details menu include Download alongside Rename/Move/Delete, or does Download stay
  a separate always-visible quick action on the card? → A: Download stays as its own visible
  quick action on the card; only Rename/Move/Delete move into the details menu.
- Q: What specific interaction starts/continues multi-select? → A: A dedicated "Select" mode
  toggle in the toolbar; while active, tapping/clicking a card selects it instead of opening it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A compact details menu instead of separate Rename/Move/Delete buttons (Priority: P1)

Right now every file/folder card always shows four action buttons (Download, Rename, Move,
Delete) at once, which makes the browse view feel cluttered. Instead, each card shows its
Download quick action plus a single small "details" control; opening the details control reveals
Rename, Move, and Delete in a menu, so the card shows at most two controls instead of four until
the user actually wants to rename, move, or delete that item.

**Why this priority**: This is the core, most visible request and delivers the decluttering
value on its own, independent of whether bulk selection ships at the same time.

**Independent Test**: Open a folder with several items and confirm each card shows only its
thumbnail, name, a Download quick action, and one small details control — no other
permanently-visible action buttons. Open the details control on one item and confirm Rename,
Move, and Delete still work the same way they do today.

**Acceptance Scenarios**:

1. **Given** a folder with multiple files and folders, **When** the view renders, **Then** each
   card shows exactly a Download quick action and one details control, and no other always-visible
   action buttons.
2. **Given** a card's details menu is open, **When** the user chooses Rename, Move, or Delete,
   **Then** the same dialog/confirmation already used today appears and behaves identically.
3. **Given** a card's details menu is open, **When** the user clicks elsewhere or presses
   Escape, **Then** the menu closes without taking any action.
4. **Given** the details menu is open on one card, **When** the user opens the details menu on a
   different card, **Then** the first menu closes (only one menu is open at a time).

---

### User Story 2 - Select several items and act on them together (Priority: P2)

A user with many files to organize can select several files and/or folders at once and move or
delete all of them in a single step, instead of repeating Move/Delete individually for each one.

**Why this priority**: Builds on User Story 1's decluttered cards but is a distinct, larger
capability (multi-item state, a new confirmation step, partial-failure reporting) that delivers
its own standalone value for users managing many items at once.

**Independent Test**: In a folder with 3+ items, turn on Select mode from the toolbar, select
more than one item, confirm a bulk Move and bulk Delete action become available, and confirm
applying one moves/deletes every selected item.

**Acceptance Scenarios**:

1. **Given** a folder with several items, **When** the user turns on Select mode from the
   toolbar and taps/clicks 3 items, **Then** those 3 items show as selected, bulk Move and bulk
   Delete actions become available, and a visible count shows 3 selected.
2. **Given** Select mode is on, **When** the user taps/clicks an item, **Then** it toggles that
   item's selection instead of opening its preview or navigating into it.
3. **Given** 3 items are selected, **When** the user applies bulk Delete, **Then** a single
   confirmation naming the count appears, and confirming moves all 3 to Trash.
4. **Given** 3 items are selected, **When** the user applies bulk Move to a chosen destination,
   **Then** all 3 items move there, subject to the same conflict rules a single move already
   enforces (e.g., a folder can't move into itself or one of its own subfolders).
5. **Given** a bulk action is applied to several items and one of them fails (e.g., it was
   already deleted in another session), **When** the action completes, **Then** every other
   selected item still succeeds and the failure is clearly reported for the specific item, not
   the whole batch.
6. **Given** Select mode is off, **When** the user views the folder, **Then** no selection
   controls or bulk action controls are shown, and cards behave exactly as in User Story 1.
7. **Given** items are selected, **When** the user turns Select mode off, navigates to a
   different folder, or starts a search, **Then** the selection clears.
8. **Given** Select mode is on and a folder has several items loaded, **When** the user chooses
   "Select all", **Then** every currently-loaded item becomes selected and the control now offers
   to deselect all.
9. **Given** every currently-loaded item is selected via "Select all", **When** the user chooses
   the same control again, **Then** every item is deselected.

---

### Edge Cases

- What happens when a user tries to turn on Select mode while a dialog (e.g., "New folder") is
  open? The Select mode toggle should be unavailable while a dialog is open, consistent with how
  drag-and-drop upload is already disabled in that situation.
- What happens if a dialog is opened (e.g., via a details menu's Rename) while Select mode is
  already on? Opening the dialog does not clear the existing selection; it resumes when the
  dialog closes. Only navigating away or explicitly turning Select mode off clears it.
- What happens if a user selects an item and then that same item is removed by another session
  (e.g., another device deletes it) before a bulk action runs? The bulk action should treat it
  like the other partial-failure case (Acceptance Scenario 5): the rest of the batch still
  completes, and the missing item is reported rather than silently ignored or aborting everything.
- What happens if a folder that's part of the current selection is scrolled out of view or a
  further page is loaded? Selection is limited to items already loaded into the current view;
  items loaded afterward are not retroactively included.
- What happens to an open details menu if the underlying item is deleted (e.g., by a bulk action
  triggered from a different card) while the menu is open? The menu closes without action.
- What happens when a user has only one item in a folder — can they still select it? Yes; bulk
  actions on a single-item selection behave the same as today's single-item actions, just reached
  through Select mode instead of a dedicated button.
- What happens to an open card details menu (User Story 1) when the user turns on Select mode?
  Any open details menu closes; while Select mode is on, cards respond to taps/clicks by
  toggling selection rather than opening a details menu or a preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each file/folder card MUST show at most two always-visible controls instead of
  today's four: a Download quick action (for files) and one compact details control. Rename,
  Move, and Delete are no longer always-visible buttons.
- **FR-002**: Opening a card's details control MUST reveal a menu containing Rename, Move, and
  Delete, each behaving exactly as its existing button does today (same dialogs, confirmations,
  and error messages). Download is not included in this menu — it remains the separate,
  always-visible quick action from FR-001.
- **FR-003**: Only one card's details menu may be open at a time; opening another card's menu, or
  clicking outside/pressing Escape, closes the current one without side effects.
- **FR-004**: The toolbar MUST offer a "Select" mode toggle. Turning it on enters selection mode
  for the current folder/search view; while on, tapping/clicking a card toggles that item's
  selection instead of opening its preview, navigating into it, or opening its details menu. This
  toggle (and each card's selected state) MUST be operable on touch-only phone screens the same
  way the toolbar's other buttons already are, needing no hover or right-click.
- **FR-005**: While Select mode is on and one or more items are selected, the system MUST show
  bulk Move and bulk Delete actions that apply to every selected item, along with a visible count
  of how many items are selected.
- **FR-006**: Bulk Move MUST enforce the same destination-conflict rules already enforced for a
  single-item move (e.g., no moving a folder into itself or a descendant of itself).
- **FR-007**: Bulk Delete MUST show one confirmation naming how many items will be moved to
  Trash before proceeding, consistent with today's single-item delete confirmation.
- **FR-008**: If some items in a bulk action fail while others succeed, the system MUST complete
  the successful ones and clearly report which specific items failed and why, rather than
  discarding the whole batch or leaving the user unsure what happened.
- **FR-009**: Selection state MUST be scoped to the current folder/search view and MUST clear
  when the user turns Select mode off, navigates to a different folder, or starts a new search.
- **FR-010**: The Select mode toggle MUST be unavailable while any modal dialog is open,
  consistent with how other interactions (e.g., drag-and-drop upload) are already disabled in
  that situation; a dialog opened from within an already-active Select mode (e.g., via the
  details menu's Rename) does not itself clear the current selection.
- **FR-011**: The details menu and any bulk-selection controls MUST remain fully usable, with no
  two controls overlapping, at the smallest supported phone width (360px), consistent with the
  application's existing responsive requirement.
- **FR-012**: The details menu (and, once selected, bulk actions) MUST be available on search
  results as well as normal folder browsing, extending today's behavior where per-item actions
  are hidden while searching.
- **FR-013**: While Select mode is on, the system MUST offer a "Select all" control that selects
  every currently-loaded item in one action. When every currently-loaded item is already
  selected, the same control MUST instead deselect all of them. Consistent with FR-004's scope,
  this applies only to items already loaded into the current view — it does not fetch further
  pages.

### Key Entities

- **Selection**: The set of file/folder items a user has currently marked for a bulk action.
  Exists only for the duration of viewing one folder/search result set; not saved, shared, or
  visible to any other user or session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every file/folder card shows at most two always-visible action controls (Download
  quick action + details control), down from up to four today, at both desktop and 360px widths.
- **SC-002**: A user can rename, move, or delete a single item through the details menu in the
  same number of steps as today's dedicated buttons (open the control, choose the action, confirm
  if applicable).
- **SC-003**: A user can move or delete 5 selected items in one confirmation step, instead of
  repeating a single-item action 5 times.
- **SC-004**: 100% of bulk actions that partially fail clearly identify every failed item to the
  user; no item's outcome is left unreported.
- **SC-005**: No two controls (details menu button, selection controls, bulk action bar) overlap
  at the smallest supported phone width (360px).

## Assumptions

- Builds on `004-ui-polish-viewer`'s already-fixed card layout; this feature further reduces the
  number of always-visible controls on each card from four down to two (Download + details).
- Bulk actions are scoped to Move and Delete, matching the examples in the request. Rename
  (requires a unique name per item, so doesn't generalize to a batch) and any bulk "download
  multiple items" capability (e.g., as an archive) are out of scope for this feature.
- Selection is limited to items already loaded into the current view (matches the app's existing
  keyset-pagination behavior); it does not attempt to represent "everything in a folder" beyond
  what's been paginated in.
- No change to who can act on what: the details menu and bulk actions are available to exactly
  the same users, for exactly the same items, as today's single-item actions (per-user isolation
  unchanged).
