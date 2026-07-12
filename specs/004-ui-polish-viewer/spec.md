# Feature Specification: UI Layout Polish & Viewer Enhancement

**Feature Branch**: `004-ui-polish-viewer`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "The UI of the website is not that compact. 2 objects overlaps each other. SO please enhnace those. And also the video viewwe is not that good. Please enhance that one also. And examine what could also be enhanced on User Interface"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No overlapping elements while browsing files (Priority: P1)

While browsing a folder or viewing search results, no two visible elements — a file/folder
card, its thumbnail, its name, its size/type label, or its Rename/Move/Delete/Download
controls — ever render on top of one another. Today, an item with a long name (for example,
one produced by pasting a web page title into the "Download from web" feature) can grow past
its own card and visibly cover the neighboring item's card and buttons, making both items hard
to read and risking a misclick on the wrong file's Delete button.

**Why this priority**: This is the most severe and most visible defect: it makes the app look
broken and creates a real risk of acting on the wrong item (e.g., deleting the wrong file).
It must be fixed before any other visual polish.

**Independent Test**: Place several files/folders in one folder, including at least one with
an unusually long or unbroken name (long sentence-like title, or a name with no spaces), and
view that folder at both a typical desktop width and a narrow phone-sized width. Confirm every
card's thumbnail, name, label, and action buttons stay fully legible and clickable, with no
part of any card hidden or covered by a neighboring card.

**Acceptance Scenarios**:

1. **Given** a folder containing several items where one has an unusually long name, **When**
   the folder is viewed on a desktop-width screen, **Then** that item's card and its action
   buttons render at a consistent size and do not extend into or cover the neighboring item's
   card or buttons.
2. **Given** the same folder, **When** viewed on a narrow (360px-wide) phone screen, **Then**
   every card stays fully within its own space with no visual collision between items.
3. **Given** a list of search results with mixed name lengths, **When** the results are shown,
   **Then** each result's action controls are clearly distinguishable and clickable without
   risk of accidentally hitting a different item's control.

---

### User Story 2 - Full-screen viewer controls never cover the media (Priority: P1)

While viewing a photo or video full-screen, the close button, the filename, and the
previous/next navigation arrows always stay in the space around the photo/video — never on
top of the image or video frame itself. Today, the previous/next arrows can sit directly over
the outer edges of the photo or video, hiding part of what the user is trying to look at,
especially on narrower screens where the media fills most of the available width.

**Why this priority**: Directly reported by the user as an overlap problem, and it affects the
core "view your media" experience for both photos and videos.

**Independent Test**: Open a photo and a video from within a folder/search result set that has
more than one item, at both a typical desktop width and a narrow phone-sized width, using
items whose displayed size leaves little surrounding margin. Confirm the previous/next
buttons, close button, and filename never sit on top of the visible photo/video frame.

**Acceptance Scenarios**:

1. **Given** a photo open full-screen with a next item available, **When** the photo is wide
   enough to leave little margin on either side, **Then** the previous/next buttons appear
   outside the photo's visible edges, never covering part of the photo itself.
2. **Given** a video open full-screen with a long title, **When** the viewer is open, **Then**
   the title text and the close button never touch or overlap each other, regardless of title
   length.
3. **Given** the full-screen viewer is open on a narrow phone-sized screen, **When** the user
   looks at the area behind the media, **Then** the browsing page behind it is fully hidden,
   with no distracting page content bleeding through.

---

### User Story 3 - A tidier, more compact layout (Priority: P2)

Spacing throughout the app is consistent and intentional, so the interface feels tidy rather
than cluttered. In particular, the upload-progress list currently runs a file's name, its
status/percentage, and its remove button together with no visible separation, so they read as
one jumbled piece of text (e.g., "myfile.txtDone✕").

**Why this priority**: Explicitly requested ("not that compact"). It's a real readability
problem but not a functional break like Stories 1–2, so it follows them in priority.

**Independent Test**: Upload multiple files, including at least one with a long name, and
confirm each row in the upload-progress list clearly separates the filename, the
status/percentage, and the remove button with visible spacing, with no merged or squeezed-
together text anywhere in the list.

**Acceptance Scenarios**:

1. **Given** an upload in progress, **When** the progress list is shown, **Then** each file's
   name, its status/percentage, and its remove button have clear, consistent spacing between
   them.
2. **Given** several completed and in-progress uploads stacked together, **When** the list is
   shown, **Then** the rows are evenly spaced and easy to scan without feeling cramped.

---

### User Story 4 - A more polished, watchable video viewer (Priority: P2)

Opening a video feels considered rather than incidental: the video displays at a comfortable
viewing size instead of tiny in a mostly empty black screen, the viewer shows where the current
video sits within the set being browsed, and the title bar does not linger indefinitely over
the frame in a way that distracts from watching.

**Why this priority**: Separately and explicitly called out by the user as needing
enhancement, beyond the shared overlap problem covered in Story 2.

**Independent Test**: Open a video that is part of a multi-item folder or search result set.
Confirm it displays at a comfortably large viewing size (not shrunk to its original pixel
dimensions when those are small), and that the viewer indicates the item's position within
the set (e.g., "3 of 12").

**Acceptance Scenarios**:

1. **Given** a video whose original resolution is small, **When** it is opened full-screen,
   **Then** it is displayed at a comfortably large viewing size rather than its tiny native
   pixel size.
2. **Given** a video that is part of a multi-item folder or search result set, **When** it is
   open, **Then** the viewer shows the item's position within that set.
3. **Given** a video is playing, **When** the viewer is open, **Then** the filename/title bar
   does not obstruct playback controls and is not a permanent, unavoidable obstruction over the
   frame.

---

### Edge Cases

- What happens when a name is extremely long with no natural break point (e.g., a long run of
  characters with no spaces)? The name must still be truncated to fit rather than expanding
  its card or overlapping a neighbor.
- What happens when a folder or search result contains only a single item (no previous/next
  item exists)? No navigation arrows should appear, and none of the space they would have
  occupied should be left overlapping the content.
- What happens when the photo or video being viewed is very small (e.g., a small icon-sized
  image or a low-resolution video)? It should scale up to a comfortable size without becoming
  so large that it looks blurry or distorted beyond reasonable limits.
- What happens on the smallest supported phone width (360px) when an item has several action
  buttons (Download/Rename/Move/Delete)? The buttons must stack or wrap without overlapping the
  card's thumbnail, name, or neighboring items.
- What happens when many files are uploaded at once and the progress list grows long? The list
  must remain readable and must not overlap the toolbar or the file listing below it.
- What happens when a file or folder name contains emoji or non-Latin characters (already seen
  in real usage via downloaded video titles)? The name must render and truncate correctly
  without breaking the surrounding layout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The file browser MUST render every file/folder card, its thumbnail, name, and
  action controls such that no two items' visual elements overlap, regardless of name length,
  character set, item count, or screen width.
- **FR-002**: When a file or folder name is too long to fit its allotted display space, the
  system MUST truncate the displayed name (e.g., with an ellipsis) rather than letting it
  expand into, or push aside, neighboring elements.
- **FR-003**: Each item's action controls (Rename/Move/Delete/Download or equivalent) MUST
  remain fully within that item's own card area and MUST NOT extend into or cover a
  neighboring item's card or controls.
- **FR-004**: The full-screen photo/video viewer MUST position its close control, filename
  display, and previous/next navigation controls entirely outside the visible bounds of the
  photo/video itself, on every supported screen size.
- **FR-005**: The full-screen viewer's filename display MUST NOT overlap the close control,
  regardless of filename length.
- **FR-006**: The full-screen viewer's backdrop MUST fully obscure the page behind it so no
  distracting page content is visible through or around the viewer.
- **FR-007**: The upload-progress list MUST display each file's name, status/progress, and
  remove control with clear, consistent visual separation between them.
- **FR-008**: Spacing and sizing of cards, toolbars, and lists MUST be visually consistent
  across the application, with no unintended gaps or cramped areas.
- **FR-009**: When a photo or video's original size is smaller than the available viewing
  area, the full-screen viewer MUST scale it up to a comfortable viewing size rather than
  displaying it at its tiny original size.
- **FR-010**: When viewing an item that belongs to a multi-item folder or search result set,
  the full-screen viewer MUST indicate the item's position within that set (e.g., "3 of 12").
- **FR-011**: All of the above MUST hold at both a typical desktop width and the smallest
  supported phone width (360px), consistent with the application's existing responsive
  requirement.
- **FR-012**: This work MUST NOT remove or change any existing functional capability (upload,
  download, rename, move, delete, search, folder navigation, trash, carousel navigation) —
  only its visual layout and presentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a folder or search result list containing items with long or unusual names,
  100% of item cards and their action controls render fully within their own boundaries with
  zero visual overlap, verified at both desktop and 360px-wide screens.
- **SC-002**: In the full-screen viewer, the navigation, close, and title controls never cover
  any part of the displayed photo or video frame, verified for both portrait- and landscape-
  oriented media at desktop and 360px widths.
- **SC-003**: Across all upload rows tested (including long filenames), 100% show the
  filename, status, and remove control as visually distinct, with no merged or overlapping
  text.
- **SC-004**: A video with a small original resolution displays at a size filling at least 70%
  of the available viewer height or width (whichever dimension constrains it), rather than its
  native pixel size.
- **SC-005**: For any folder or search result containing more than one media item, a user can
  tell which item they are currently viewing relative to the total from within the full-screen
  viewer, without closing it.
- **SC-006**: A visual review across the Browse, full-screen viewer, uploads, downloads, and
  trash views finds no remaining instance of overlapping or visually merged interactive
  elements, at both desktop and 360px widths.

## Assumptions

- This is a visual/layout enhancement only: no new backend endpoints, data, or user-facing
  capabilities are introduced. It builds on the existing frontend-only precedent set by
  `003-drag-drop-carousel-nav`.
- "Enhance the video viewer" is scoped to fixing the overlap problem, improving how small
  videos scale to fill the viewing area, and adding a lightweight position-in-set indicator —
  it does not add new playback features (custom scrubber, speed controls, captions, etc.),
  which are out of scope for this pass.
- The existing visual theme (dark color palette) and overall navigation structure are kept
  as-is; this is a targeted defect-fix and polish pass, not a visual redesign.
- "More compact" means removing inconsistent or missing spacing and eliminating visual
  collisions — not reducing how much information is currently visible to the user.
- The supported screen sizes remain the two already validated elsewhere in the project
  (typical desktop width and 360px phone width); no new device classes are introduced.
- The open-ended request to "examine what else could be enhanced" is satisfied by extending
  the same audit (overlap + spacing consistency) across the existing Browse, viewer, uploads,
  downloads, and trash screens, rather than by introducing unrelated new UI features.
