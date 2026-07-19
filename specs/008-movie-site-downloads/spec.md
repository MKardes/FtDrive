# Feature Specification: Download Movies from Embed-Based Streaming Sites

**Feature Branch**: `008-movie-site-downloads`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "On some movie sites like \"https://www.hdfilmcehennemi.nl/\" there are movie videos on them. I want them to be downloaded also"

> Context: FtDrive already lets a user paste a web-page address and have the video on that page
> downloaded into their own drive (feature `002-url-video-download`). That flow succeeds for
> directly linked files, common video-hosting sites, and pages where the media address can be
> discovered by examining the page. It does **not** yet succeed on a large class of movie
> streaming sites (the user's example is `hdfilmcehennemi.nl`) where the movie does not play on
> the page itself: the page merely embeds one or more third-party players (hosted on other
> domains, often nested in iframes), the real stream is fetched only after the player starts and
> is protected so that a context-less request is rejected, and the same movie is usually offered
> through several alternative playback servers. Today the user pastes such a page and is told "no
> video found." This feature extends the existing download-from-web capability so those movies
> download into the drive too, while keeping every existing safety and isolation guarantee.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download a movie whose player is embedded from another site (Priority: P1)

A signed-in user is on a movie page of a streaming site (for example `hdfilmcehennemi.nl`) where
the movie plays inside an embedded player served from a different domain. They copy the movie
page's address, open FtDrive's "download from web" input, paste it, and pick a destination folder
(or accept the default "Downloads" folder). FtDrive examines the page, follows into the embedded
player to find the real video stream, downloads it, and reassembles it into a single file. When it
finishes, the movie appears in the user's drive — named from the movie's title — with a thumbnail,
playback, and all normal file actions, exactly like any other file.

**Why this priority**: This is the entire point of the request. Without it, the named class of
sites returns "no video found." With just this story, a user can turn a movie page into a saved,
playable movie — a complete, demonstrable extension of the existing feature.

**Independent Test**: Submit the URL of a publicly playable movie page from an embed-based site,
accept the default folder, and verify a single complete, playable movie file appears in that
user's drive (and nowhere else), named after the movie.

**Acceptance Scenarios**:

1. **Given** a signed-in user and a movie page whose video plays only through a player embedded
   from another domain, **When** the user submits the page URL and confirms a destination,
   **Then** FtDrive locates the stream inside the embedded player, downloads and reassembles the
   movie, and the completed file appears in the chosen folder — previewable, playable, renamable,
   movable, and deletable like an uploaded file.
2. **Given** a movie whose stream is delivered in segments (streaming delivery) and requires the
   originating player's request context to be fetched, **When** the download runs, **Then** the
   segments are fetched with the required context and merged into one continuous, fully playable
   file — not a partial clip and not a 0-byte/broken file.
3. **Given** a movie page whose title contains non-English characters, **When** the movie is
   saved, **Then** the file keeps a human-readable name derived from the movie's title, and an
   existing same-named file is never overwritten (a distinct name is chosen).
4. **Given** a page that genuinely contains no downloadable video in any embed, **When**
   examination completes, **Then** the user is told no downloadable video was found and nothing is
   added to their drive.

---

### User Story 2 - Fall back automatically across a movie's alternative sources (Priority: P2)

Movie streaming pages usually list several playback servers ("sources"/"alternatives") for the
same movie. Any one of them may be offline, empty, geo-blocked, or broken at a given moment. The
user does not care which server is used — they want the movie. When the first source cannot be
downloaded, FtDrive automatically tries the other sources for that movie until one succeeds, and
reports failure only when every available source has been tried.

**Why this priority**: On these sites the *first* listed source frequently fails; a single-source
attempt would make the feature feel unreliable even when the movie is perfectly downloadable from
another server. This makes Story 1 trustworthy in the real world. It is not P1 because a page that
happens to have a working first source already succeeds with Story 1 alone.

**Independent Test**: Submit a movie page whose first listed source is broken but at least one
other source works, and confirm the movie still downloads without the user taking any extra
action — then submit a page where every source is broken and confirm a single clear "all sources
failed" outcome.

**Acceptance Scenarios**:

1. **Given** a movie page offering several playback sources where the first cannot be downloaded
   but a later one can, **When** the user submits the page, **Then** FtDrive tries sources in turn
   and completes the download from a working source, with no extra user action required.
2. **Given** a movie page where none of the offered sources yields a downloadable stream, **When**
   examination and attempts complete, **Then** the user sees a single clear "could not download
   from any available source" result and no partial file is left behind.
3. **Given** a source that requires interacting with the player (e.g. starting playback) before
   the stream appears, **When** that source is examined, **Then** examination triggers playback
   within the existing time/resource limits before deciding the source has no stream.

---

### User Story 3 - Choose quality when a source offers several (Priority: P3)

A working source sometimes exposes the same movie in several qualities (for example 1080p and
720p). After examination, the user may be shown the available qualities with distinguishing
details (resolution and estimated size where known) and pick one. When the user does not choose,
the highest available quality is downloaded.

**Why this priority**: Improves control and avoids over-large downloads on richer sources, but the
feature is already useful with a sensible automatic choice (Stories 1–2). This reuses and extends
the multi-quality selection the existing download feature already provides.

**Independent Test**: Submit a movie whose working source exposes multiple qualities, verify the
qualities are presented with distinguishing details, select one, and confirm only that quality is
downloaded; then submit without choosing and confirm the highest quality is used.

**Acceptance Scenarios**:

1. **Given** a source exposing multiple qualities for one movie, **When** examination completes,
   **Then** the user sees the qualities with available details and can pick which to download.
2. **Given** a source exposing multiple qualities, **When** the user does not choose explicitly,
   **Then** the highest available quality is downloaded.
3. **Given** a source exposing only one quality, **When** the user submits the movie, **Then** it
   downloads without asking the user to choose.

---

### Edge Cases

- **Embedded/nested players**: the movie is inside an iframe, sometimes several levels deep, on a
  different domain than the page → examination follows into the embedded player(s) to find the
  stream, bounded by the existing examination time/resource limits, rather than stopping at the
  top page.
- **Protected stream rejects context-less requests**: the stream (e.g. an HLS playlist) returns an
  access error unless fetched with the originating player's reference and/or a short-lived token →
  FtDrive fetches it with the required context; if it still cannot be fetched, the source is
  treated as failed (try the next source) and, if all fail, reported clearly — never a silent
  partial file.
- **All alternative sources fail** (offline, empty, broken) → one clear "could not download from
  any available source" result; nothing is added to the drive.
- **Geo-blocked / region-locked source** → reported as inaccessible (so the user understands why),
  and other sources are still tried; not a silent failure.
- **Login / subscription / paywall in front of the player** → reported as inaccessible, consistent
  with the existing feature, rather than failing silently.
- **Copy-protected (DRM) movie stream** → reported as not downloadable; removing or bypassing copy
  protection is explicitly out of scope (unchanged from the existing feature).
- **Obfuscated / anti-bot player that needs playback to start before revealing the stream** →
  examination triggers playback within limits; if no stream appears in time, the source is treated
  as having no downloadable video.
- **Site markup changes or the site is unsupported** → the page is reported as "no downloadable
  video found"; the feature must not crash or become unavailable for other sites, movies, or users.
- **An embed or stream host resolves to an internal/private network address** → refused by the
  existing outbound-URL safety guard at every hop; following embeds must never become a way to
  reach the owner's internal network.
- **The movie is larger than the per-file size cap, the per-user storage quota, or exceeds the
  per-download time cap** → stopped with a clear, retryable reason and no partial file, exactly as
  for any other download.
- **Series/episode listing pages** (a page listing many episodes rather than one movie) → out of
  scope; bulk/playlist downloading remains out of scope (unchanged from the existing feature).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a submitted page plays its video only through a player embedded from another
  domain (iframe/embed), the system MUST follow into the embedded player(s) — including players
  nested one or more levels deep — to locate the actual video stream, instead of reporting "no
  video found" merely because the top-level page has no direct media.
- **FR-002**: The system MUST locate video streams that a movie page reveals only after its player
  initializes or begins playback, including players whose stream address is produced by
  client-side, script-driven, or obfuscated code, performing this within the existing examination
  time and resource limits.
- **FR-003**: When a movie page offers multiple alternative playback sources/servers for the same
  movie, the system MUST attempt them (in a sensible order) and succeed if any one yields a
  downloadable stream, without requiring the user to choose a server or to retry manually. It MUST
  report failure only after all available sources have been tried.
- **FR-004**: The system MUST fetch protected streams using the request context the source
  requires — such as the originating page/embed reference and any short-lived access token
  discovered during examination — so that streams which reject context-less requests still
  download. When a stream remains inaccessible even with that context, the system MUST treat that
  source as failed and MUST NOT leave a partial file.
- **FR-005**: A movie downloaded through an embedded/streaming source MUST be reassembled into a
  single file and become a normal drive file, with the same preview, thumbnail, playback, rename,
  move, and delete behavior as an uploaded file (unchanged from the existing feature).
- **FR-006**: The saved file MUST be named from the movie's human-readable title discovered during
  examination (sanitized for the filesystem, preserving non-English characters as far as the
  filesystem allows); when a file of the same name already exists in the destination, a distinct
  name MUST be chosen rather than overwriting.
- **FR-007**: When a chosen source exposes several qualities for the movie, the system MUST default
  to the highest available quality and MAY let the user choose among the qualities (with
  distinguishing details where available); when only one quality exists, it MUST proceed without
  asking.
- **FR-008**: When a movie cannot be downloaded, the system MUST report a clear, human-readable,
  retryable reason and MUST distinguish at least these outcomes: (a) no downloadable video found in
  any embed, (b) all alternative sources failed, (c) source inaccessible (geo-block, login,
  paywall), and (d) copy-protected (DRM). It MUST never fail silently or leave a partial/corrupt
  file.
- **FR-009**: Copy-protected (DRM) movie streams remain out of scope: the system MUST report them
  as not downloadable and MUST NOT attempt to remove or circumvent copy protection.
- **FR-010**: Every address the system follows or fetches during examination and download — the
  submitted page, each embed/iframe host, the stream playlist, and each media segment host — MUST
  pass the existing outbound-URL safety (SSRF) guard; following embeds MUST NOT become a way to
  reach the drive server itself or the owner's private/internal network.
- **FR-011**: All existing guarantees of the download-from-web feature MUST continue to hold
  unchanged for movies downloaded this way: authentication on every path (default deny); strict
  per-user isolation of download requests, progress, history, and resulting files; background
  execution that survives the user disconnecting and the server restarting; atomic finalize so a
  file appears only when fully and correctly downloaded; per-user storage quota; per-user
  concurrency limit with queueing; per-download maximum time and size caps; and per-user download
  history the user can clear.
- **FR-012**: Support MUST be for embed-based movie sites as a **class** (the named site being one
  example), not a single hard-coded domain. When a specific site is unsupported or its markup
  changes, the system MUST degrade gracefully by reporting "no downloadable video found" for that
  page and MUST NOT break the feature for other sites, movies, or users.

### Key Entities

- **Movie Page**: the address the user submits — a page presenting a single movie whose playback is
  provided by one or more embedded sources. Owned by exactly one user's download request.
- **Embedded Player Source**: one of the alternative playback servers a movie page offers for the
  same movie; carries its embed reference (host/address) and, after examination, whether a
  downloadable stream was found and why it failed if not. Belongs to the examination of a movie
  page; ordered so the system can try them in turn.
- **Protected Stream Reference**: the located video stream plus the request context needed to fetch
  it (originating reference, any short-lived token, and required request details). Transient,
  belongs to the source it was discovered in, and is passed through the outbound-URL safety guard
  before any byte is fetched.
- **Download Request / Detected Video Candidate / Downloaded File**: unchanged from the existing
  download-from-web feature — the request the user submits, the candidate(s) chosen, and the
  resulting ordinary drive file linked back to its originating request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can download a movie from a supported embed-based site by doing no more than
  pasting the movie page's address and confirming a destination — they never have to locate the
  embed, the player, or the stream address themselves.
- **SC-002**: For movie pages that are publicly playable (not DRM, not geo-blocked, not
  login-walled) and have at least one working source, at least 90% of download attempts complete
  as a single, fully playable movie file on the first submission.
- **SC-003**: When a movie's first listed source fails but another works, the movie still downloads
  with **zero** additional user actions beyond the original submission (automatic source
  fallback), verified across pages with mixed working/broken sources.
- **SC-004**: 100% of movie files that appear in the drive are complete and play end-to-end for
  their full runtime; interrupted, cancelled, failed, or all-sources-failed attempts leave no
  visible partial or corrupt file.
- **SC-005**: 100% of failed downloads present a specific, human-readable reason distinguishing "no
  video found," "all sources failed," "inaccessible," and "copy-protected" — never a silent or
  generic failure.
- **SC-006**: Every existing guarantee still holds while following embeds: 100% of cross-user
  isolation negative tests and outbound-URL (SSRF) safety negative tests pass, and no movie
  download can reach the drive server or the owner's internal network.

## Assumptions

- **Builds on `002-url-video-download`**: This feature extends the existing download-from-web
  capability and its whole pipeline (background jobs, worker pool, progress/cancel/retry, per-user
  history, storage quota, concurrency limit, time/size caps, atomic finalize, SSRF guard, and the
  default "Downloads" folder). Those behaviors are inherited unchanged; this spec only adds the
  ability to reach and download the video inside embed-based movie sites.
- **Site class, not one domain**: `hdfilmcehennemi.nl` is the motivating example; the feature
  targets the general pattern of movie pages that embed third-party players and offer alternative
  sources. No single site is hard-coded, and site-specific behavior degrades gracefully when a site
  is unsupported or changes.
- **DRM stays out of scope**: Streams protected by digital rights management are reported as not
  downloadable; this feature does not remove or bypass copy protection. The protection handled here
  is ordinary web request context (originating reference / short-lived token), not DRM.
- **Subtitles and separate audio-only extraction are out of scope**: The download captures the
  movie's video together with its playback audio as one file. Downloading separate subtitle tracks,
  extracting audio only, or re-encoding/format conversion are out of scope (consistent with the
  existing feature); subtitle support may be considered as a future enhancement.
- **Single movie per submission**: The user submits one movie page at a time. Series/episode
  listing pages, bulk downloading of entire seasons/playlists, and channel-wide downloads remain
  out of scope.
- **Automatic source order**: When several sources exist, the system tries them automatically in a
  sensible order until one succeeds; the user is not asked to pick a server (they may still pick a
  *quality* per Story 3). Choosing a specific server manually is out of scope.
- **Responsibility for use**: FtDrive is a self-hosted personal tool. Responsibility for what is
  downloaded and for respecting each source site's terms of service and applicable law rests with
  the owner and their users, as with any general-purpose download tool. This feature adds no
  circumvention of technical copy-protection measures.
- **Outbound access**: As with the existing feature, examining and downloading a movie requires the
  server to fetch content from the internet at the user's explicit request — a user-initiated,
  documented outbound connection consistent with the project's privacy rules (content is fetched
  in; no user data is sent out).
- **Best-effort extraction**: Because these sites actively change their markup and players, "at
  least one working source downloads the movie" is a best-effort target; when every source is
  genuinely unavailable, the correct outcome is a clear failure, not a partial file.
