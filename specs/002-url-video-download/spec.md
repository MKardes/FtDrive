# Feature Specification: Download Videos from Web Pages to Drive

**Feature Branch**: `002-url-video-download`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "We need to add a new feature. InternetDownloadManager is an extention to download videos from webpages. I want to add that functionallity on my drive project. I want a feature that you present a url and the webpage is examined and the video is downloaded to your drive."

> Context: FtDrive users often watch videos on external websites and want to keep a personal
> copy in their own drive. Today they must use a separate desktop tool (such as Internet
> Download Manager), download the file to their computer, and then upload it to FtDrive.
> This feature removes those steps: the user pastes a web page address into FtDrive, FtDrive
> examines the page, finds the video content, and saves it directly into the user's own
> drive space — where it behaves like any other file they own.

## Clarifications

### Session 2026-07-02

- Q: How deeply must a page be examined to find video — is a real browser engine required? → A: Hybrid — try lightweight static/manifest extraction first, and fall back to a sandboxed headless browser (with enforced resource and time limits) only when the video cannot be found statically.
- Q: How many downloads may a single user run at once before the rest queue? → A: 5 concurrent downloads per user (prototype default; may be tuned later).
- Q: Beyond the storage limit, what stops a single download from running forever or growing unbounded? → A: Both a per-download maximum wall-clock time and an absolute per-file size ceiling; exceeding either fails the download with a clear, retryable reason.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download a video by pasting a page URL (Priority: P1)

A signed-in user finds a video on a web page they want to keep. They open FtDrive, paste the
page's address into a "download from web" input, and pick a destination folder in their drive
(or accept the default "Downloads" folder). FtDrive examines the page, identifies the video,
and downloads it into the chosen folder. When it finishes, the video appears in their drive
like any other file — with a thumbnail, preview/playback, and all normal file actions.

**Why this priority**: This is the entire point of the feature. With only this story
implemented, a user can already turn a URL into a saved video in their drive — a complete,
demonstrable MVP.

**Independent Test**: Can be fully tested by submitting the URL of a page containing a single
accessible video and verifying the video file appears, complete and playable, in the chosen
folder of that user's drive — and nowhere else.

**Acceptance Scenarios**:

1. **Given** a signed-in user and a web page containing one downloadable video, **When** the
   user submits the page URL and confirms a destination folder, **Then** the video is saved
   into that folder in their drive and can be previewed, played, renamed, moved, and deleted
   like any uploaded file.
2. **Given** a submitted URL whose page contains no detectable video, **When** examination
   completes, **Then** the user is told that no video was found and nothing is added to
   their drive.
3. **Given** a URL that points directly to a video file (not a page), **When** the user
   submits it, **Then** the file is downloaded to the chosen folder without a page
   examination step.
4. **Given** a user who has not signed in, **When** any download-from-web capability is
   accessed, **Then** access is denied exactly as it is for every other drive capability.

---

### User Story 2 - Track and manage downloads in progress (Priority: P2)

Video downloads can be large and slow. The user wants to see what is queued, examining,
downloading, finished, or failed — with progress shown for active downloads — and wants to
cancel a download or retry a failed one. Downloads keep running even if the user closes the
browser or their connection drops; the outcome is waiting for them when they return.

**Why this priority**: Without visibility and control, large downloads feel broken — users
can't tell whether anything is happening, can't stop mistakes, and can't recover from
failures. This makes Story 1 trustworthy for real-world (large, slow) videos.

**Independent Test**: Start a download of a large video, observe live progress, cancel it,
and confirm no file appears in the drive. Start another, disconnect, reconnect later, and
confirm it completed on its own.

**Acceptance Scenarios**:

1. **Given** an active download, **When** the user opens the downloads view, **Then** they
   see its state and progress (amount transferred and, where known, total size).
2. **Given** an active download, **When** the user cancels it, **Then** the download stops,
   any partial data is discarded, and no partial file appears in their drive.
3. **Given** a download that failed (for example, the source went offline), **When** the user
   views it, **Then** they see a clear, human-readable reason and can retry it.
4. **Given** an active download, **When** the user signs out or closes their browser,
   **Then** the download continues to completion and its result is visible when they return.
5. **Given** a list of past downloads, **When** the user reviews it, **Then** they see only
   their own downloads — never another user's — and can clear their own history.

---

### User Story 3 - Choose among multiple detected videos or qualities (Priority: P3)

Some pages contain several videos, or one video available in several qualities. After
examination, the user is shown what was found — with distinguishing details such as title,
duration, resolution, and estimated size where available — and picks what to download. When
nothing is chosen explicitly, the best available quality of the primary video is used.

**Why this priority**: Improves accuracy and control on richer pages, but the feature is
already useful with a sensible automatic choice (Stories 1–2).

**Independent Test**: Submit a page containing multiple videos, verify the list of candidates
is shown with distinguishing details, select one, and confirm only that one is downloaded.

**Acceptance Scenarios**:

1. **Given** a page with multiple detectable videos, **When** examination completes,
   **Then** the user sees each candidate with available details (title, duration, quality,
   estimated size) and can select which one(s) to download.
2. **Given** a video available in multiple qualities, **When** the user does not choose one
   explicitly, **Then** the highest available quality is downloaded.

---

### Edge Cases

- Submitted text is not a valid URL, or the address is unreachable or times out → the user
  gets a clear error; nothing is saved and nothing is left behind.
- The page requires a login, subscription, or paywall FtDrive does not have → examination
  reports that the content is not accessible, rather than failing silently.
- The video is copy-protected (DRM) → reported as not downloadable; such content is out of
  scope (see Assumptions), never silently skipped.
- The video is larger than the user's remaining storage space → the download is refused or
  stopped with a clear message, and no partial file is kept.
- A file with the same name already exists in the destination folder → the new file gets a
  distinct name; existing files are never silently overwritten.
- The destination folder is deleted while the download is running → the download fails with
  a clear message; no orphaned file appears.
- The server restarts or crashes mid-download → the download either resumes or is marked
  failed and retryable; a corrupt or partial file never appears in the drive.
- The submitted URL points at the drive server itself or at private/internal network
  addresses → the request is refused; this feature must never become a way to probe the
  owner's network.
- A very slow source site → other users and the requester's normal drive usage remain
  unaffected; downloads beyond the per-user concurrency limit wait in a queue.
- A source that streams endlessly or far too slowly, or a stream of unknown/unbounded length
  → the per-download time limit or size ceiling (FR-020) stops it with a clear, retryable
  failure, freeing the worker slot; no partial file is kept.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Signed-in users MUST be able to submit a web page URL and have the system
  examine that page for downloadable video content.
- **FR-002**: The system MUST report the outcome of examination: the video(s) found — with
  title, duration, quality, and estimated size where available — or a clear "no video
  found" result.
- **FR-003**: Users MUST be able to choose the destination folder within their own drive;
  when none is chosen, the system MUST use a default "Downloads" folder in the user's drive,
  creating it if needed.
- **FR-004**: The system MUST also accept URLs that point directly at a video file and
  download them without a page-examination step.
- **FR-005**: Downloads MUST run on the server in the background: they MUST continue and
  complete even if the user signs out, closes the browser, or loses connectivity.
- **FR-006**: A completed download MUST become a normal file in the user's drive, with the
  same preview, thumbnail, playback, rename, move, and delete behavior as an uploaded file.
- **FR-007**: The system MUST show each download's state (queued, examining, downloading,
  completed, failed, cancelled) and live progress while transferring.
- **FR-008**: Users MUST be able to cancel a download that has not completed; cancellation
  MUST discard partial data and MUST NOT leave a partial file visible in the drive.
- **FR-009**: Failed downloads MUST show a human-readable reason and MUST be retryable.
- **FR-010**: A file MUST appear in the drive only when its download completed fully; an
  interrupted, failed, or cancelled download MUST never leave a corrupt or partial file
  visible.
- **FR-011**: Every download-related capability MUST require authentication; unauthenticated
  access MUST be denied (default deny), consistent with the rest of the product.
- **FR-012**: All download requests, progress, history, and resulting files MUST be strictly
  scoped to the requesting user; no user may see, infer, or affect another user's downloads,
  and attempts to reference them MUST be indistinguishable from the item not existing.
- **FR-013**: The system MUST refuse to fetch URLs that resolve to the drive server itself
  or to private/internal network addresses, so the feature cannot be used to reach the
  owner's internal network.
- **FR-014**: The system MUST enforce the user's storage limits: a download that would
  exceed the user's available space MUST be refused or stopped with a clear message.
- **FR-015**: The system MUST limit how many downloads a user runs at once to **5 concurrent
  downloads per user** and queue the rest, so that normal drive usage (browsing, upload,
  preview) stays responsive for everyone while downloads run. This limit is a configurable
  default and may be tuned without changing the feature's behavior.
- **FR-016**: Copy-protected (DRM) or otherwise inaccessible content MUST be reported to the
  user as not downloadable — never silently skipped or silently failed.
- **FR-017**: The system MUST keep a per-user record of recent downloads (source address,
  outcome, resulting file where applicable), visible only to that user, and the user MUST
  be able to clear their own history.
- **FR-018**: When saving into a folder that already contains a file with the same name, the
  system MUST choose a distinct name rather than overwrite the existing file.
- **FR-019**: Page examination MUST first attempt lightweight extraction from the page source
  and media manifests; when no video can be identified that way, the system MUST render the
  page in a sandboxed headless browser engine — with enforced resource and time limits — to
  detect video that only appears after client-side scripts run. A page where neither method
  finds video MUST be reported as "no video found."
- **FR-020**: Each download MUST be bounded by a maximum wall-clock time AND an absolute
  per-file size ceiling, independent of the user's remaining storage. Exceeding either bound
  MUST stop the download, discard partial data (per FR-010), free its worker slot, and record
  a clear, human-readable, retryable failure reason. Both bounds are configurable defaults.

### Key Entities

- **Download Request**: A user's instruction to fetch video content; carries the submitted
  URL, the requesting user, the chosen destination folder, its state (queued, examining,
  downloading, completed, failed, cancelled), progress, timestamps, and a failure reason
  when applicable. Owned by exactly one user.
- **Detected Video Candidate**: A video found while examining a page; carries whatever
  distinguishing details the page exposes (title, duration, available qualities, estimated
  size) and belongs to the examination that produced it.
- **Downloaded File**: The resulting file in the user's drive — an ordinary drive file in
  every respect, with a link back to the download request it came from (its origin).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from pasting a page URL to a started download in at most 3 steps
  (paste, review what was found, confirm) and under 30 seconds for a typical page.
- **SC-002**: At least 90% of download attempts from pages whose video content is publicly
  accessible and not copy-protected complete successfully on the first attempt.
- **SC-003**: 100% of downloaded files that appear in the drive are complete and playable;
  interrupted, cancelled, or failed downloads leave no visible partial or corrupt files.
- **SC-004**: Downloads finish without the user staying connected: a user who starts a
  download, leaves, and returns after completion sees the finished file and final status.
- **SC-005**: Cross-user isolation holds for downloads exactly as for files: 100% of
  attempts to view, cancel, or retry another user's download are rejected with no
  indication the download exists (verified by negative tests).
- **SC-006**: With a user's maximum of 5 concurrent downloads running, that user and others
  can still browse folders, upload, and preview media without noticeable degradation.

## Assumptions

- **Supported sources**: The feature targets videos a page makes available for playback —
  directly linked video files, videos embedded in pages, and segment-based streaming
  delivery — including popular video-hosting sites where the content is publicly accessible.
  Copy-protected (DRM) content is out of scope and is reported as not downloadable.
- **Examination approach**: Pages are examined static-first (page source and media manifests),
  with a sandboxed headless browser engine used only as a fallback when the video cannot be
  found statically. The headless render runs under enforced resource and time limits so that
  JS-heavy pages do not exhaust server resources (see FR-019).
- **Responsibility for use**: FtDrive is a self-hosted personal tool; responsibility for
  what is downloaded and for respecting the source site's terms rests with the owner and
  their users, as with any download tool.
- **Entry point**: The URL is pasted into FtDrive's own interface. A browser extension that
  detects videos while browsing (as Internet Download Manager provides) is out of scope for
  this feature.
- **Default destination**: A "Downloads" folder at the top of the user's drive, created
  automatically the first time it is needed.
- **Multiple candidates**: When a page yields several videos, the user selects; when there is
  a single obvious video, it proceeds after a single confirmation. When qualities vary, the
  default is the highest available.
- **Storage accounting**: Downloaded videos count against the user's existing storage
  allotment; there is no separate download quota.
- **Concurrency**: A per-user limit of 5 simultaneous downloads (with queueing) applies;
  users do not need unlimited parallel downloads. The limit is a configurable default chosen
  for the first prototype and may be tuned later.
- **Outbound access**: This feature requires the server to fetch content from the internet
  at the user's explicit request. This is a user-initiated, documented outbound connection,
  consistent with the project's privacy rules (no user data is sent out — content is only
  fetched in).
- **Out of scope for this feature**: scheduled or recurring downloads, downloading entire
  playlists/channels in bulk, audio-only extraction, and re-encoding/format conversion of
  downloaded videos.
