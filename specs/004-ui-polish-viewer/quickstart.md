# Quickstart: UI Layout Polish & Viewer Enhancement

Validates the four user stories against a running dev instance. Assumes the feature-001 dev
setup already works (see `specs/001-personal-cloud-drive/quickstart.md`).

## Prerequisites

- Backend running (`npm run dev:backend`) and frontend dev server running (`npm run
  dev:frontend`).
- A logged-in user with a folder containing at least 3 files, one with an unusually long name
  (30+ characters, ideally with no spaces, e.g. a title pasted via "Download from web").
- At least one small-resolution video/image (well under typical screen size) and one image/video
  whose displayed size fills most of the viewport width, to exercise the scaling and gutter
  fixes.

## Scenario 1: No overlapping file/folder cards (User Story 1, P1)

1. Open a folder containing 3+ items, at least one with a long/unbroken name.
2. View it at a typical desktop width.
   - **Expect**: every card renders at the same, consistent size; the long name truncates with
     an ellipsis instead of growing the card; no card's thumbnail, name, or action buttons cover
     a neighboring card's.
3. Resize (or use device emulation) to 360px wide.
   - **Expect**: same — no overlap, buttons wrap/stack cleanly within each card's own space.
4. Repeat with a search result list containing the same mixed name lengths.
   - **Expect**: same guarantee holds for search results.

## Scenario 2: Viewer controls never cover the media (User Story 2, P1)

1. Open a photo (or video) that is part of a multi-item folder, sized so it fills most of the
   viewport width, at a 360px-wide viewport.
   - **Expect**: the previous/next buttons render beside the image/video, not on top of any part
     of it.
2. Open an item with a very long filename.
   - **Expect**: the title text truncates and never touches the close button.
3. Open the viewer at any width and look at the area around the media.
   - **Expect**: the page behind the viewer is fully hidden — no readable text/buttons bleed
     through the backdrop.

## Scenario 3: Tidier upload-progress list (User Story 3, P2)

1. Upload 2+ files at once, including one with a long filename.
   - **Expect**: each row clearly separates the filename, the status/percentage, and the
     dismiss (✕) button with visible spacing — nothing reads as merged text.
2. Let uploads finish and let the list grow to several rows.
   - **Expect**: rows stay evenly spaced and the list doesn't crowd the "New folder"/"Download
     from web" buttons or the file grid below it.

## Scenario 4: Polished video viewer (User Story 4, P2)

1. Open a small-resolution video from within a multi-item folder or search result.
   - **Expect**: it displays at a comfortably large size, not its tiny native pixel size.
2. While it's open, check the title bar area.
   - **Expect**: a "n of total" position indicator is visible alongside the title.
3. Step to the next/previous item using the arrows or arrow keys.
   - **Expect**: the position indicator updates to match.
4. Open the one item in a single-item search result.
   - **Expect**: no position indicator and no nav arrows render (nothing to navigate to).

## Automated coverage

- Component tests (Vitest + Testing Library): `FileGrid` renders long names without its card
  exceeding its grid cell's measured width; `Uploader` row shows name/status/remove as distinct
  elements; `PhotoViewer`/`VideoPlayer` render a position label when `position` is provided and
  omit it when it isn't.
- Playwright E2E (`e2e/tests/`): extend the existing browse/upload/viewer journeys with a
  long-name fixture folder and a 360px-viewport pass, asserting via bounding-box checks (as used
  during this feature's own investigation) that no two of the checked elements' rectangles
  intersect.
