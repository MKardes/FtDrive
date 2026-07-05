# Feature Specification: Drag-and-Drop Uploads & Media Carousel Navigation

**Feature Branch**: `003-drag-drop-carousel-nav`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "- Drag and drop might be added on uploads
  - Add right, left arrows to be able to slide images or videos etc"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload files by dragging them in (Priority: P1)

A user has the current folder open in their drive and wants to add files without hunting for the
"Upload" button. They drag one or more files from their operating system's file manager (or desktop)
and drop them anywhere over the folder view. The files begin uploading into the currently open
folder, with the same per-file progress, error/retry, and name-collision ("kept both") feedback the
existing click-to-upload button already provides.

**Why this priority**: Drag-and-drop is the single most requested convenience for a file-storage
app and removes friction from the most frequent action in the product (getting files in). It's
additive to the existing upload button, so it can ship and be validated on its own.

**Independent Test**: Open a folder, drag one or more files from the desktop onto the file grid,
and confirm they appear in the upload progress list and land in that folder once complete —
without touching the existing "Upload" button.

**Acceptance Scenarios**:

1. **Given** a folder is open and not in search mode, **When** the user drags files from outside
   the browser and drops them anywhere over the folder view, **Then** each file starts uploading
   into the currently open folder and appears in the upload progress list.
2. **Given** the user is dragging files over the folder view, **When** the drag enters the drop
   area, **Then** the view shows a clear visual cue (e.g., highlighted drop zone) indicating a drop
   will upload here; **When** the drag leaves without dropping, **Then** the cue is removed and no
   upload starts.
3. **Given** a dropped file has the same name as an existing file in the folder, **When** the
   upload completes, **Then** the system applies the same conflict handling already used for
   button-initiated uploads (kept both, with user-facing notice).
4. **Given** one file in a multi-file drop fails to upload, **When** the failure occurs, **Then**
   that file is marked as failed with a retry option while the other files continue independently.
5. **Given** the user is viewing search results, **When** they drag files over the view and drop,
   **Then** the drop is silently ignored (no upload starts, no message shown), consistent with the
   existing upload button being hidden in that state.

---

### User Story 2 - Move between photos and videos with arrows (Priority: P2)

A user opens a photo or video in the full-screen viewer and wants to look through the rest of the
media in that folder without closing the viewer each time. Left/right arrow controls (and
left/right arrow keys) let them step to the previous or next image/video in the current listing,
staying in the full-screen viewer the whole time.

**Why this priority**: This turns single-item preview into a browsing experience, which is high
value for photo/video-heavy folders, but depends on the viewer that already exists — it's a
self-contained enhancement layered on top of current preview behavior.

**Independent Test**: Open a folder containing at least three previewable files, open the first one
in the viewer, and use the arrows/keys to step forward and backward through the rest without
returning to the grid.

**Acceptance Scenarios**:

1. **Given** the full-screen viewer is open on a file that has a next item in the current listing,
   **When** the user clicks the right arrow (or presses the right arrow key), **Then** the viewer
   replaces its content with the next file in the listing and updates the displayed name.
2. **Given** the full-screen viewer is open on a file that has a previous item in the current
   listing, **When** the user clicks the left arrow (or presses the left arrow key), **Then** the
   viewer shows the previous file in the listing.
3. **Given** the currently viewed file is the first item in the listing, **When** the viewer is
   open, **Then** the left arrow is hidden or disabled (no wrap-around).
4. **Given** the currently viewed file is the last item in the listing, **When** the viewer is
   open, **Then** the right arrow is hidden or disabled (no wrap-around).
5. **Given** the listing contains only one previewable item, **When** the viewer is open, **Then**
   neither arrow is shown.
6. **Given** the user navigates to a video with the arrows, **When** the next item loads, **Then**
   any prior video playback stops and the new item is ready to play from the start.
7. **Given** more items exist beyond what is currently loaded on screen (pagination), **When** the
   user arrows past the last currently-loaded item, **Then** the system loads the next page
   automatically so navigation continues without the user leaving the viewer.
8. **Given** the viewer is open, **When** the user presses Escape or clicks outside the content,
   **Then** the viewer closes as it does today, regardless of how many times arrows were used.

---

### Edge Cases

- Dragging a mix of files and folders from the OS: only files are accepted for upload; dragged
  folder entries are ignored (not recursively uploaded), consistent with the existing uploader's
  file-only behavior.
- Dragging non-file content (e.g., a link or block of text dragged from another app/browser tab)
  over the view: no upload starts and no error is shown.
- Dropping a very large number of files at once: each is queued and uploaded following the same
  per-file progress/limits the existing uploader already applies.
- Dropping files while another dialog (rename, move, delete, download-from-web) is open: the drop
  is ignored until the dialog is closed, so uploads can't happen "underneath" a modal.
- Arrowing through a listing that includes files the viewer can't natively preview (e.g.,
  documents): the viewer still steps to them and shows the existing "can't preview, download
  instead" fallback, rather than skipping them.
- Using the arrow keys while focus is inside a text field (e.g., an open rename prompt) is not
  applicable, since the viewer and other dialogs aren't shown at the same time.
- Very small screens / touch devices: arrows remain reachable (e.g., via on-screen tap targets),
  since not all users can drag with a keyboard.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The folder view MUST accept files dropped from outside the browser (OS drag-and-drop)
  and upload them into the currently open folder.
- **FR-002**: The system MUST show a visible drop-target indication while a drag carrying files is
  over the folder view, and remove it when the drag leaves or ends.
- **FR-003**: Dropped files MUST go through the same upload pipeline, progress reporting,
  per-file error/retry, and name-collision handling as files added via the existing "Upload"
  button.
- **FR-004**: Dropping files MUST be disabled while the user is viewing search results, matching
  the existing button-based uploader's availability.
- **FR-005**: Dropping non-file drag content (e.g., text, links) MUST be ignored without starting
  an upload or showing an error.
- **FR-006**: Dropping items while a modal dialog is open MUST be ignored until that dialog is
  closed.
- **FR-007**: The full-screen media viewer MUST offer "previous" and "next" controls (on-screen
  arrows) and support left/right arrow key presses to move through the previewable files in the
  currently open listing (folder contents), in the same order they appear in the grid.
- **FR-008**: The "previous" control MUST be hidden or disabled when the currently viewed file is
  the first item in the listing; the "next" control MUST be hidden or disabled when it is the last
  item. Navigation MUST NOT wrap around from last to first or first to last.
- **FR-009**: When navigating to a video, any currently playing video MUST stop before the next
  item is shown.
- **FR-010**: If the user navigates past the last currently-loaded item and more items exist,
  the system MUST load the next page of the listing automatically so navigation can continue.
- **FR-011**: Navigation controls MUST NOT be shown when the current listing contains only one
  previewable item.
- **FR-012**: Closing the viewer (Escape key or backdrop click) MUST continue to work exactly as
  it does today, regardless of prior navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can upload files by dropping them onto the folder view, with the files
  appearing in the upload progress list within 1 second of the drop. (Satisfied by construction:
  the drop handler adds the file to the upload queue synchronously, in the same render pass as the
  existing button-driven upload — no separate timing test is needed.)
- **SC-002**: Users can move between at least 20 consecutive photos/videos in a folder using only
  the arrow controls, without the viewer ever closing unexpectedly or losing track of position.
- **SC-003**: 100% of drops containing at least one valid file result in every valid file being
  uploaded; non-file drag content never triggers a failed upload attempt or error message.
- **SC-004**: Stepping to the next or previous item in the viewer feels instantaneous to the user
  (perceived as under 300ms) for already-loaded items. (Satisfied by construction for loaded items:
  navigation is a synchronous local array-index update with no network round-trip; only the
  cross-page case in SC-002/FR-010 involves a request, which is validated for correctness, not
  sub-300ms perceived latency.)

## Assumptions

- The existing click-to-upload flow (progress, retry, "kept both" collision handling) is the
  source of truth for upload behavior; drag-and-drop is an additional entry point into that same
  flow, not a new upload mechanism.
- "Slide through images or videos" refers to sequential previous/next navigation within the
  current folder's (or search results') listing order — not a separate curated album or shuffled
  order.
- Arrow navigation does not wrap around (no looping from the last item back to the first), matching
  common gallery viewer conventions.
- Drag-and-drop targets the currently open folder only; there is no drag-to-a-different-folder
  (drop-to-move) behavior in this feature — that would be a separate enhancement.
- Directory (folder) drag-and-drop from the OS is out of scope; only individual files are accepted.
- Touch/mobile drag-and-drop from outside the browser is out of scope for this feature (not
  broadly supported by mobile OS file pickers); on-screen arrow taps cover touch navigation needs.
