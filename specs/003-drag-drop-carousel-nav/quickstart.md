# Quickstart: Drag-and-Drop Uploads & Media Carousel Navigation

Validates the two user stories end-to-end against a running dev instance. Assumes the
feature-001 dev setup already works (see `specs/001-personal-cloud-drive/quickstart.md`).

## Prerequisites

- Backend running (`cd backend && npm run dev`) and frontend dev server running
  (`cd frontend && npm run dev`), or the combined dev script if one exists.
- A logged-in user with an empty-ish test folder.
- At least 3 image/video files on your local machine to drag in (any small `.jpg`/`.mp4` fixtures
  work — e.g. reuse `backend/tests/fixtures/` sample media if present).

## Scenario 1: Drag-and-drop upload (User Story 1, P1)

1. Open the app, navigate into a folder (not search results).
2. Drag 2–3 files from your OS file manager over the folder view.
   - **Expect**: a visible highlighted drop-zone cue appears while dragging over the view.
3. Drop the files.
   - **Expect**: each file appears in the upload progress list and reaches "Done"; the files show
     up in the folder grid once their upload completes (same as clicking "Upload").
4. Repeat step 2–3 dropping a file with the same name as an existing file.
   - **Expect**: the upload succeeds and is kept as a renamed copy, with the same "kept both"
     notice the button-based uploader shows.
5. Type something into the search box, then try dragging a file over the view.
   - **Expect**: no drop-zone cue appears and no upload starts.
6. Open any dialog (e.g., "New folder"), then try dragging a file over the view.
   - **Expect**: no drop-zone cue appears and no upload starts while the dialog is open.

## Scenario 2: Carousel navigation (User Story 2, P2)

1. In a folder with at least 3 previewable files (mix of images and videos if possible), click the
   first file to open the full-screen viewer.
   - **Expect**: a "next" control is visible; a "previous" control is hidden/disabled (first
     item).
2. Click "next" (or press the right arrow key) repeatedly.
   - **Expect**: the viewer steps through each file in the same order shown in the grid, updating
     the displayed name each time; if a video was playing, it stops before the next item appears.
3. Continue past the currently loaded page (in a folder with enough items to paginate).
   - **Expect**: navigation continues seamlessly — the next page loads automatically without
     closing the viewer or requiring a manual "Load more" click.
4. Click "previous" (or press the left arrow key) back to the first item.
   - **Expect**: the "previous" control becomes hidden/disabled again at the first item.
5. Reach the last file in the folder.
   - **Expect**: the "next" control is hidden/disabled (no wrap to the first item).
6. In a folder with exactly one previewable file, open it.
   - **Expect**: neither control is shown.
7. Press Escape (or click the backdrop) at any point.
   - **Expect**: the viewer closes exactly as it does today.

## Automated coverage

- Component tests (Vitest + Testing Library): drop-zone drag/drop/ignore-non-file/disabled-states,
  and viewer navigation (arrow click + keydown, boundary disable, single-item hide, video stop).
- E2E (Playwright, `e2e/tests/browse-media.spec.ts`): the two scenarios above against a real
  running instance.
