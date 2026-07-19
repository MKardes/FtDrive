# Quickstart & Validation: Download Movies from Embed-Based Streaming Sites

This guide validates that FtDrive can download a movie from a page whose video plays only through an
embedded, context-protected, multi-source player (example: `hdfilmcehennemi.nl`) — the goal of
feature `008-movie-site-downloads`. It extends `002-url-video-download`; nothing here replaces the
002 quickstart, it adds the embed-specific checks.

Design details live in [`plan.md`](./plan.md), [`research.md`](./research.md),
[`data-model.md`](./data-model.md), and [`contracts/api-delta.md`](./contracts/api-delta.md) — this
file is a run/verify guide, not an implementation.

## Prerequisites

Same as feature 002 (all already required — no new dependency):

- Node.js 22, the repo installed (`npm install` at root / workspaces).
- **`yt-dlp`** and **`ffmpeg`** on `PATH` (or `YT_DLP_PATH` set). `yt-dlp --version` must succeed.
- **Playwright Chromium** installed (`npx playwright install chromium`) — the headless discovery
  engine.
- A running backend + frontend (dev: API on its port, SPA served separately) and a signed-in user.
- Outbound internet access from the server (the feature fetches the user-requested movie).

New optional env knobs (safe defaults; see research R8) — set only to tune:

```bash
DOWNLOAD_MAX_SOURCES=5           # alternative mirrors examined/attempted per movie
DOWNLOAD_PLAYBACK_WAIT_MS=8000   # wait for a media request after triggering playback, per source
DOWNLOAD_EXAMINE_TIMEOUT_MS=30000  # existing; may raise for interactive discovery
```

## Automated tests (fakes — no live sites, fast, deterministic)

The extractor and browser probe are injected through their existing seams (`Extractor`,
`BrowserProbeLike`), so these run offline in CI:

```bash
# From repo root
npm --workspace backend run test -- downloads-embed-source \
  downloads-source-fallback downloads-stream-headers \
  downloads-embed-quality downloads-geo-inaccessible downloads-embed-ssrf
```

Expected: all green. What each pins (see plan.md → Project Structure):

| Test | Proves | Requirement |
|------|--------|-------------|
| `downloads-embed-source` | A page with no direct media but an embedded player is discovered via the (faked) browser probe and downloads to a node. | FR-001, FR-002 |
| `downloads-source-fallback` | First resolved source fails at download → next source succeeds (node created); **all** sources fail → job ends `failed` with `errorCode = ALL_SOURCES_FAILED` and **no** node/partial file. | FR-003, US2 |
| `downloads-stream-headers` | The download engine is invoked with the captured `--referer`/`--add-header` context; a stream that "403s" without it succeeds with it. | FR-004 |
| `downloads-embed-quality` | A resolved source's renditions are listed; the chosen quality (size-coded) downloads; omitting a choice downloads the best. | FR-007, US3 |
| `downloads-geo-inaccessible` | A geo/login failure ends `failed` with a specific inaccessible reason (not silent, not `NO_VIDEO_FOUND`); examine returns `422`. | FR-008, FR-009 |
| `downloads-embed-ssrf` | A discovered stream on an internal address is dropped by the pipeline's `url-guard` re-check and never fetched. The existing `isolation-downloads` suite still passes, so cross-user `404` isolation holds with embed-following. | FR-010, Principle I/II |

## Manual end-to-end validation (live site)

> Responsibility for what is downloaded and for respecting each source site's terms rests with the
> owner, as with any download tool (spec Assumptions). DRM content is out of scope and reported, not
> bypassed.

### Scenario A — Download a movie from an embed-based page (US1, FR-001/002/004/005/006)

1. Sign in. Open **New → Download from web** (the entry point in the redesigned shell) and paste a
   publicly playable movie page URL from an embed-based site.
2. Click **Examine**. Within the examine timeout you should reach the review step (a quality picker,
   or "ready to download") — not "no downloadable video found."
3. Confirm the destination (accept **Downloads**) and click **Download**.
4. **Expected**: a job appears in the downloads panel and progresses `examining → downloading →
   completed`. On completion the movie is a normal file in **Downloads**, named from the movie
   title, with a thumbnail, and it **plays end-to-end** (full runtime, audio in sync — segments were
   merged). It renames/moves/deletes like any file.

### Scenario B — Automatic source fallback (US2, FR-003)

1. Use a movie whose first listed server is known-flaky (or repeat Scenario A across a few titles).
2. **Expected**: you take **no** extra action when a source fails — the job still completes from a
   working mirror. If you can find a movie whose every source is dead, the job ends **failed** with a
   message like *"None of this page's video sources could be downloaded"* (`ALL_SOURCES_FAILED`) and
   **nothing** partial appears in the drive.

### Scenario C — Quality choice (US3, FR-007)

1. On a movie whose source exposes multiple qualities, the review step lists them (e.g. 1080p /
   720p). Pick 720p and download.
2. **Expected**: the 720p file is saved. Submitting without choosing saves the highest quality. A
   single-quality movie downloads without asking.

### Scenario D — Clear, specific failures (FR-008, FR-009)

Try, and confirm each shows a **distinct** human-readable reason (never a silent/generic failure,
never a partial file):

- A page with genuinely no video → "No downloadable video was found."
- A geo-blocked / login-walled source → an inaccessible reason.
- A DRM/copy-protected title → reported as not downloadable (not bypassed).

### Scenario E — Safety still holds (FR-010, FR-011, Principle I/II)

- While signed out, the download endpoints are denied (default deny) — unchanged from 002.
- Another user's download id returns a uniform `404`.
- A movie exceeding the size/time cap or your storage quota stops with a clear, retryable reason and
  leaves no partial file.
- (Operator check) A page embedding an internal/private address as a "source" does not cause the
  server to fetch it — the guard drops it; the movie either downloads from a public source or reports
  no downloadable video.

## Success criteria mapping (from spec.md)

| Scenario | Success Criterion |
|----------|-------------------|
| A | SC-001 (paste → confirm, no manual URL hunting), SC-002 (≥90% of publicly playable movies with a working source complete), SC-004 (complete & playable) |
| B | SC-003 (zero extra actions on source failure), SC-004 (no partial file) |
| D | SC-005 (100% of failures show a specific reason) |
| E | SC-006 (isolation + SSRF negative tests all pass) |
