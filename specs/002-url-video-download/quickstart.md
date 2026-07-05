# Quickstart & Validation Guide: Download Videos from Web Pages to Drive

This guide validates feature 002 end-to-end against the spec's user stories. It **builds on**
[feature-001's quickstart](../001-personal-cloud-drive/quickstart.md) — get FtDrive running there
first. It references [data-model.md](./data-model.md) and
[contracts/openapi.yaml](./contracts/openapi.yaml) rather than duplicating them. Implementation
code is produced in the implementation phase (`tasks.md`).

## Additional prerequisites (beyond feature-001)

- **`yt-dlp`** installed and on `PATH` (or set `YT_DLP_PATH`) — the extraction/download engine.
  Pin a known version and keep it updated (sites change). Without it the feature reports
  *unavailable* (`503`) and the rest of FtDrive is unaffected.
- **`ffmpeg`** — already required by feature-001; also used here to merge segmented (HLS/DASH)
  streams and to generate the downloaded video's poster.
- **Headless Chromium** for the JS-render fallback (FR-019) — install the Playwright browser once
  (e.g. `npx playwright install chromium`). Only used when static extraction finds no video.
- Outbound HTTPS egress from the server to the sources you intend to download from. For
  hardening, run the download tools behind an **egress filter / network namespace** (recommended
  in the deploy guide) so only intended destinations are reachable.

## Additional configuration (environment)

Set alongside the feature-001 vars (validated fail-fast at startup; see research.md §10):

| Var | Purpose | Default |
|-----|---------|---------|
| `DOWNLOADS_ENABLED` | Master on/off for the feature | `true` |
| `YT_DLP_PATH` | Path to the yt-dlp binary | `yt-dlp` |
| `DOWNLOAD_MAX_CONCURRENCY_PER_USER` | Simultaneous downloads per user (rest queue) | `5` |
| `DOWNLOAD_MAX_BYTES` | Absolute per-download size ceiling | `21474836480` (20 GB) |
| `DOWNLOAD_MAX_DURATION_MS` | Per-download wall-clock cap | `21600000` (6 h) |
| `DOWNLOAD_EXAMINE_TIMEOUT_MS` | Bound on examination (incl. headless) | `30000` (30 s) |
| `USER_STORAGE_QUOTA_BYTES` | Per-user total storage limit (`0` = unlimited) | `0` |
| `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES` | Allow LAN/private targets (opt-in only) | `false` |

Never commit secrets; the feature adds none and emits no telemetry.

## Setup

```bash
# apply the new migration that creates the `downloads` table
npm run db:migrate

# (first run) install the headless browser used by the JS-render fallback
npx playwright install chromium

# start backend + frontend as in feature-001
npm run dev
```

Sign in as an existing user (create one via feature-001's owner/admin flow if needed).

## Validating the user stories

Use the SPA's **"Download from web"** action, or the API directly (send the session cookie from
login). Endpoints and schemas are defined in [contracts/openapi.yaml](./contracts/openapi.yaml).

### US1 — Download a video by pasting a page URL (P1)

1. **Examine**: `POST /downloads/examine { "url": "<page-with-one-video>" }` → expect
   `videoFound: true` with one candidate (title/duration/formats). A page with no video returns
   `videoFound: false` and nothing is added to the drive.
2. **Download**: `POST /downloads { "url": "<same>", "destinationFolderId": null }` → `201` with a
   `Download` in `status: queued`. Poll `GET /downloads/{id}` until `completed`.
3. **Verify the file**: the resulting `nodeId` appears in the user's **"Downloads"** folder
   (auto-created) and behaves like any upload — thumbnail/poster, in-browser playback, rename,
   move, delete. **Expected**: file is complete and playable.
4. **Direct-file URL (FR-004)**: `POST /downloads` with a URL that points straight at a video file
   → downloads without an examination step.
5. **Auth (FR-011)**: repeat any call without the session cookie → `401`.

### US2 — Track and manage downloads in progress (P2)

1. **Progress**: start a large download; `GET /downloads` shows `downloading` with
   `bytesDownloaded`/`totalBytes` advancing.
2. **Cancel (FR-008)**: `POST /downloads/{id}/cancel` → `canceled`; confirm **no** node was
   created and no partial file exists in the drive.
3. **Failure + retry (FR-009)**: point at an unreachable source; expect `failed` with a
   human-readable `errorMessage`; `POST /downloads/{id}/retry` re-queues it.
4. **Survives disconnect (FR-005)**: start a download, close the browser, return later →
   `GET /downloads/{id}` shows it `completed`, file present.
5. **Survives restart**: start a download, restart the server mid-transfer → the job is
   reconciled and resumes (re-queued from scratch); no partial file is ever visible.
6. **History isolation (FR-012/FR-017)**: `GET /downloads` lists only the caller's downloads;
   `DELETE /downloads` clears the caller's terminal history without deleting files.

### US3 — Choose among multiple detected videos / qualities (P3)

1. **Multiple candidates**: examine a page with several videos → multiple
   `DetectedVideoCandidate`s, each with formats (quality/estimated size).
2. **Pick one**: `POST /downloads` with a chosen `formatId` → only that one downloads.
3. **Default quality**: omit `formatId` → the highest-quality format of the primary video is
   downloaded.

## Gating checks (must pass — Principles I & II, integrity)

Run the feature's automated suites (see research.md §11). They assert:

- **Isolation** — user A gets a uniform `404` when trying to `GET`/`cancel`/`retry`/`DELETE` user
  B's download (no existence disclosure).
- **SSRF (FR-013)** — submitting a loopback/private/link-local/self URL (or a redirect to one) is
  refused with a generic `400`; no fetch occurs.
- **Atomicity (FR-010)** — a forced mid-download failure or a cancel leaves **no** node and **no**
  leftover temp file.
- **Caps/quota (FR-014/FR-020)** — over-size, over-time, and over-quota downloads are refused
  (`409`) or stopped (`failed`, retryable); a partial file never appears.
- **Availability** — with `DOWNLOADS_ENABLED=false` or `yt-dlp` absent, examine/create/retry
  return `503` while the rest of FtDrive keeps working.

## Success criteria mapping

| Criterion | How to check |
|-----------|--------------|
| SC-001 (≤3 steps, <30 s to start) | US1 steps 1–2 within the examine timeout |
| SC-002 (≥90% success on accessible video) | batch of public, non-DRM URLs via `POST /downloads` |
| SC-003 (100% completed files playable; no partials) | US1 step 3 + the atomicity gating check |
| SC-004 (finishes without staying connected) | US2 steps 4–5 |
| SC-005 (cross-user isolation) | the isolation gating check |
| SC-006 (responsive under max concurrency) | run 5 concurrent downloads; browse/upload/preview stay smooth |
