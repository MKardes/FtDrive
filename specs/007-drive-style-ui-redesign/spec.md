# Feature Specification: Drive-Style UI Redesign

**Feature Branch**: `007-drive-style-ui-redesign`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "My app's UI is very bad. Please enhance it deeply on each places. Examine it and create a very good design (similar to google drive)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate a modern app shell (Priority: P1)

A signed-in user lands in the app and immediately understands where they are and where they can
go. Instead of a cramped row of text links, they see a familiar drive-style layout: a persistent
left sidebar listing the main areas (My Drive, Shared, Downloads, Trash — plus Users for the
owner), a prominent "New" action that gathers creation/upload actions in one place, and a top
bar with a large, centered search field and a user menu (account, sign out). On a phone, the
sidebar collapses behind a menu button so the content keeps the full width.

**Why this priority**: The shell frames every other screen. Without it, per-page polish still
reads as "a bad app". It is also the only story that changes how users reach existing features,
so it must land first and prove that nothing becomes unreachable.

**Independent Test**: Sign in on a desktop-width and a phone-width viewport, visit every area
from the sidebar (and the user menu), create a folder / upload a file via the "New" action, and
run a search — all existing destinations and actions are reachable and clearly labeled with
icons and text.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a desktop-width screen, **When** any page loads, **Then** a
   left sidebar shows all main areas with icons and highlights the current one, and a top bar
   shows a search field and a user menu.
2. **Given** a signed-in user on a phone-width screen, **When** any page loads, **Then** the
   sidebar is hidden behind a menu button, the content uses the full width, and opening the
   menu shows the same destinations.
3. **Given** a user browsing any folder, **When** they use the "New" action, **Then** they can
   create a folder, upload files, or start a web download from that one place, and the result
   appears in the current folder.
4. **Given** the owner account, **When** they open the sidebar, **Then** a Users area is
   visible; for non-owner users it is absent.
5. **Given** any signed-in page, **When** the user opens the user menu, **Then** they can reach
   Account settings and sign out.

---

### User Story 2 - Browse files the drive way (Priority: P2)

While browsing a folder, the user sees their content presented the way modern drive products
do: folders as compact tiles that read at a glance, files as cards with large thumbnails,
crisp icons instead of emoji, quiet hover states, and a breadcrumb path that always shows where
they are. They can switch between a thumbnail grid and a detail list (name, size), and their
choice is remembered. Selecting, opening, renaming, moving, sharing, downloading and deleting
all keep working exactly as before — just presented through cleaner controls and menus.

**Why this priority**: The folder view is where users spend nearly all their time; it is the
single highest-impact screen for the "very good design" goal, but it needs the P1 shell around
it first.

**Independent Test**: Open a folder containing folders, images, videos and other files. Verify
folders and files are visually distinct, thumbnails render, the ⋮ menu offers the same actions
as today with icons, the grid/list toggle switches presentation and survives a reload, and
select mode still bulk-moves/deletes.

**Acceptance Scenarios**:

1. **Given** a folder with mixed content, **When** it renders, **Then** folders and files are
   visually distinct, image/video files show thumbnails, and other types show a clear
   type-specific icon (no emoji glyphs anywhere in the app).
2. **Given** the folder view, **When** the user switches between grid and list, **Then** the
   same items render in the chosen presentation, and the choice persists after a reload.
3. **Given** a nested folder, **When** it renders, **Then** a breadcrumb path from "My Drive"
   to the current folder is visible and each ancestor is clickable.
4. **Given** any file or folder card, **When** the user opens its ⋮ menu, **Then** the same
   actions available today (Share, Rename, Move, Delete, and Download for files) appear with
   icons, and the menu never renders off-screen.
5. **Given** select mode with items checked, **When** the user bulk-moves or bulk-deletes,
   **Then** behavior is unchanged from today, with the selection count and actions presented
   in a clear action bar.
6. **Given** an empty folder or an empty search result, **When** it renders, **Then** a
   friendly illustrated empty state explains the situation and (for the folder case) points at
   the "New" action.

---

### User Story 3 - Every screen speaks the same language (Priority: P3)

Sign-in, Shared, Downloads, Trash, Account, Users (admin), the full-screen viewer and the
public share page all look like parts of the same product: same colors, spacing, typography,
icons, buttons, dialogs and list styles. List-heavy screens (Trash, Shared, Downloads, Users)
present rows with clear columns and right-aligned actions instead of undifferentiated text
rows. Dialogs are consistently styled with clear titles, actions and destructive-action
emphasis. The anonymous public share page presents the shared content with the product's
branding so recipients trust what they're opening.

**Why this priority**: Consistency is what makes the redesign feel finished, but each of these
screens is lower-traffic than the folder view and depends on the shared visual language being
established by P1/P2.

**Independent Test**: Walk through sign-in → each sidebar area → open a photo/video in the
viewer → open a public share link in a private window. Every screen uses the same design
system; no screen retains the old styling.

**Acceptance Scenarios**:

1. **Given** the sign-in page, **When** it loads, **Then** it presents a branded, centered
   card consistent with the new design.
2. **Given** the Trash / Shared / Downloads / Users screens, **When** they render items,
   **Then** rows show an icon, primary text, secondary detail and right-aligned actions, and
   empty states are styled like the folder view's.
3. **Given** any confirmation of a destructive action (delete, purge, empty trash, revoke),
   **When** the dialog opens, **Then** the destructive choice is visually emphasized and the
   safe choice is the default-looking action.
4. **Given** an anonymous visitor opening a valid share link, **When** the page loads, **Then**
   they see the product brand, the shared item(s) in the new visual style, and clear
   view/download actions — with no access to any signed-in chrome.
5. **Given** the full-screen photo/video viewer, **When** it opens, **Then** its controls
   (close, previous/next, title, position) use the new icon set and styling, and navigation
   behavior is unchanged.

---

### User Story 4 - Choose a comfortable appearance (Priority: P4)

The user can switch the interface between a light appearance (the drive-style default) and a
dark appearance from the user menu. The choice applies immediately, covers every screen, and is
remembered on the next visit. Users who never touch it get the appearance matching their
device preference.

**Why this priority**: Valuable comfort feature and a strong signal of polish, but the product
is fully usable with a single well-executed appearance; it must come after the design system
exists.

**Independent Test**: Toggle the appearance from the user menu on several screens; verify
every surface (including dialogs, menus and the viewer) follows, the choice survives a reload,
and a fresh browser profile follows the device's preference.

**Acceptance Scenarios**:

1. **Given** a first visit with no stored choice, **When** the app loads, **Then** the
   appearance follows the device's light/dark preference.
2. **Given** any screen, **When** the user switches appearance from the user menu, **Then**
   every visible surface updates immediately without a reload and the choice persists across
   sessions.
3. **Given** either appearance, **When** any text renders, **Then** it remains clearly legible
   against its background.

---

### Edge Cases

- Very long file/folder/user names: names truncate with ellipsis everywhere (cards, rows,
  breadcrumbs, dialogs, viewer title) and never break the layout; the full name is available
  on hover/long-press.
- Folders with hundreds of items: presentation stays paginated ("load more") and scrolling
  stays smooth in both grid and list presentation.
- Phone-width screens (≈360px): no horizontal scrolling anywhere; every action reachable; the
  sidebar drawer closes after navigating.
- Files without thumbnails (unsupported types, failed thumbnail): a clean type icon renders in
  place of the image — never a broken-image glyph.
- Keyboard-only users: every interactive control is focusable in a sensible order with a
  visible focus indicator; menus and dialogs close on Escape.
- The ⋮ menu opened near the viewport edge (last column / bottom row): the menu repositions to
  stay fully on screen.
- Mid-flight states: loading, uploading, and background downloads present consistent progress
  styling; errors present consistent, plainly-worded messages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The signed-in interface MUST present a persistent left sidebar on wide screens
  listing My Drive, Shared, Downloads, Trash — plus Users for owner accounts — each with an
  icon and a clear active-state; on narrow screens the sidebar MUST collapse into a drawer
  behind a menu button.
- **FR-002**: The interface MUST provide a single prominent "New" action, available wherever
  the user can add content, that offers: create folder, upload files, and download from web.
- **FR-003**: The top bar MUST contain the product brand (navigates to My Drive), the search
  field, and a user menu giving access to Account and sign-out. Search MUST keep today's
  behavior (searches the user's own files, results replace the folder view).
- **FR-004**: The folder view MUST offer both a thumbnail grid and a detail list presentation
  (showing at minimum name and, for files, size), with a visible toggle; the chosen
  presentation MUST persist across sessions for the user's browser.
- **FR-005**: All iconography MUST come from a single consistent icon set (no emoji glyphs as
  UI icons anywhere), with distinct icons for folders and common file categories (image,
  video, audio, document/other).
- **FR-006**: Every existing capability MUST remain available and behave identically:
  browse/navigate, search, upload (button and drag-drop), download, create folder, rename,
  move, delete-to-trash, restore, purge, empty trash, bulk select/move/delete, share dialog
  (links, people, expiry, revoke), shared-with-me browsing, my-shares management, web
  downloads (start, progress, cancel, retry, history), account settings, admin user
  management, photo/video full-screen viewing with previous/next navigation, and the
  anonymous share page. The redesign changes presentation and placement only.
- **FR-007**: All dialogs, menus, buttons, form fields, badges, progress indicators, empty
  states, loading states and error messages MUST use one shared visual system (spacing,
  radius, color, typography) across every screen, with destructive actions visually
  distinguished.
- **FR-008**: List-style screens (Trash, Shared with me, My shares, Downloads, Users) MUST
  present items as structured rows — icon, primary text, secondary detail, right-aligned
  actions — consistent across those screens.
- **FR-009**: The interface MUST offer light and dark appearances: default follows the
  device preference, a control in the user menu switches it, the choice applies to every
  surface immediately and persists across sessions for the user's browser.
- **FR-010**: Every screen MUST remain fully usable at phone width (≈360px) with no
  horizontal scrolling, and MUST scale comfortably up to large desktop widths.
- **FR-011**: Interactive controls MUST show visible hover and keyboard-focus states; menus
  and dialogs MUST close on Escape; text and controls MUST remain legible in both
  appearances.
- **FR-012**: Card/context menus MUST always render fully on screen, repositioning when
  opened near a viewport edge.
- **FR-013**: The sign-in page and the anonymous share page MUST carry the product brand and
  the same visual system, without exposing any signed-in navigation.

### Key Entities

- **Presentation preference**: the user's chosen folder-view presentation (grid or list);
  stored in the user's browser; no server data.
- **Appearance preference**: the user's chosen appearance (light, dark, or follow-device);
  stored in the user's browser; no server data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any signed-in screen, a user can reach any main area (My Drive, Shared,
  Downloads, Trash, Account) in at most 2 interactions.
- **SC-002**: 100% of the capabilities listed in FR-006 pass a manual walkthrough after the
  redesign, on both a desktop-width and a phone-width viewport.
- **SC-003**: A first-time user can locate how to upload a file and how to create a folder
  within 5 seconds of seeing the folder view, without documentation (the "New" action is
  visually primary).
- **SC-004**: At 360px viewport width, no screen shows horizontal scrolling and every action
  remains reachable.
- **SC-005**: Body text and interactive labels meet a contrast ratio of at least 4.5:1 in both
  appearances.
- **SC-006**: Grid/list and appearance choices survive a full browser reload in 100% of
  attempts.
- **SC-007**: Zero emoji glyphs remain in UI chrome; every icon renders from the shared icon
  set.
- **SC-008**: A folder of 200+ items remains scrollable and paginated with no visible layout
  breakage in either presentation.

## Assumptions

- The redesign is presentation-only: no new server capabilities, data, or permissions are
  introduced, and no existing behavior changes beyond placement/appearance of controls
  (consistent with how features 003–005 scoped frontend work).
- "Similar to Google Drive" means adopting its recognizable layout patterns (sidebar + New
  action, top search, folder tiles/file cards, grid/list toggle, light default appearance) —
  not copying Google branding, logos, or proprietary assets.
- Browser-local persistence is acceptable for presentation and appearance preferences; they do
  not need to roam between devices.
- The existing interaction model is kept: single click/tap opens items, explicit Select mode
  handles multi-select (no click-to-select/double-click-to-open change).
- The existing pagination model ("Load more") is kept; infinite auto-scroll is out of scope.
- Icons are drawn from a self-hosted, consistently-styled set (no external icon service),
  in keeping with the self-hosted principle.
