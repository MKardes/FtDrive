# Phase 1 Data Model: Download Movies from Embed-Based Streaming Sites

**No persistent schema change.** This feature adds **no table, no column, and no migration**. It
reuses the `downloads` table and the `nodes` file model exactly as feature `002-url-video-download`
defined them (see `specs/002-url-video-download/data-model.md`). What is new is entirely
**transient** (in-memory during examine/run): the resolved embedded sources and the request context
needed to fetch their streams. Because these are never stored, they carry no isolation surface of
their own.

**Isolation invariant (Principle II), unchanged**: every `downloads` query is filtered by
`owner_id = currentUser.id` and re-checked before return; a non-owned or non-existent id yields the
same `404`. Destination/result nodes use the existing owner-scoped helpers
(`resolveOwnedFolderOrThrow404`, `resolveAvailableName`, `insertFileNode`).

---

## Reused entity: Download (job + history record) — table `downloads`, unchanged

No field is added or removed. Semantics of existing fields for this feature:

| Field | Reused meaning for embed-based movies |
|-------|----------------------------------------|
| `source_url` | The **movie page** URL the user submitted (never the embed or stream URL). |
| `selection` | Chosen `formatId` (quality) or `null`/`best`. Tolerant: if it no longer exists on the source `run()` lands on, best quality is used (research R5). |
| `title` | The movie title discovered while probing the resolved stream; drives the filename + display. |
| `status` | Same lifecycle: `queued → examining → downloading → completed \| failed \| canceled`. |
| `node_id` | Set only on the atomic `→ completed` edge (the finished movie file). |
| `error_code` / `error_message` | Failure taxonomy extended with **`ALL_SOURCES_FAILED`** (research R9). |
| `attempt`, `bytes_downloaded`, `total_bytes`, timestamps | Unchanged. |

**State transitions**: identical to feature 002. The only behavioural change is *inside* the
`examining`/`downloading` phases — `run()` now iterates resolved sources (below) before deciding a
terminal state — which is invisible to the persisted state machine. A node still becomes visible
only on full success (FR-005 / atomic finalize), and every non-success path discards the scratch
temp (no partial file).

`error_code` values (superset; **bold** = new this feature):

`NO_VIDEO_FOUND` · **`ALL_SOURCES_FAILED`** · `SOURCE_INACCESSIBLE` (now also covers geo-block) ·
`DRM_PROTECTED` · `SIZE_LIMIT` · `TIME_LIMIT` · `QUOTA_EXCEEDED` · `SOURCE_UNAVAILABLE` ·
`DESTINATION_UNAVAILABLE` · `URL_NOT_ALLOWED` · `INTERRUPTED`.

---

## Transient structures (in-memory only — not persisted, not a DB entity)

These live inside the download module during `examine()`/`run()` and are discarded when the call
returns. They are the design's core additions.

### ResolvedSource

One embedded playback source (mirror) for the movie, after discovery resolved a real stream.

| Field | Type | Notes |
|-------|------|-------|
| `streamUrl` | string | The media/manifest URL sniffed after playback started (m3u8/mpd/mp4/…). Passed the SSRF guard (research R7). |
| `headers` | `StreamHeaders` | Request context that makes the fetch succeed (below). |
| `sourceLabel` | string \| null | Best-effort label for the mirror (e.g. iframe host), for logs/telemetry-free diagnostics; may surface as an optional candidate hint. |

`examine()` returns `ResolvedSource[]` in the site's DOM order (research R4). `run()` tries them in
order until one download completes; only when all fail → `ALL_SOURCES_FAILED`.

### StreamHeaders

The captured request context (research R3). All optional except what the source actually required.

| Field | Type | Notes |
|-------|------|-------|
| `referer` | string \| null | Origin page/embed the player fetched the stream from — the usual 403-gate. |
| `origin` | string \| null | `Origin` header where present. |
| `userAgent` | string \| null | UA the sandbox sent (kept consistent between discovery and fetch). |
| `cookie` | string \| null | Any cookie the **sandbox's own isolated context** set for the target host. Never a user's FtDrive session; never crosses jobs/users. |

Passed to `yt-dlp` as discrete argv: `--referer`, `--user-agent`, repeatable `--add-header
'Origin: …'` / `--add-header 'Cookie: …'` (no shell string; no injection).

### DetectedVideoCandidate (result of `POST /downloads/examine`) — shape unchanged

Still `{ candidateId, title, durationSec, formats: Format[] }` with
`Format = { formatId, quality, width, height, ext, estimatedBytes }`. For a movie source these are
the resolved stream's qualities (HLS renditions). The examine response MAY add an optional
`sourceLabel` hint, but the existing `CandidatePicker` ignores unknown fields, so **no frontend
change is required** (see contracts/api-delta.md).

---

## Reused entity: Node (the downloaded movie) — unchanged

No schema change. A completed download creates a normal **file** `Node` under the chosen (or
auto-created "Downloads") folder — same `thumb_status` lifecycle, poster/playback, rename/move/
delete, and keep-both naming as any uploaded file. The only linkage remains `downloads.node_id →
nodes.id` (origin). Non-ASCII movie titles are sanitised by the existing `sanitizeUploadName` while
preserving readability as far as the filesystem allows (FR-006).

---

## Configuration (env-only additions — research R8)

Not database rows. New tunables this model depends on, alongside the existing `DOWNLOAD_*` set:

| Var | Default | Purpose |
|-----|---------|---------|
| `DOWNLOAD_MAX_SOURCES` | `5` | Cap alternative sources examined/attempted per movie. |
| `DOWNLOAD_PLAYBACK_WAIT_MS` | `8000` | Wait for a media request after triggering playback, per source. |
| `DOWNLOAD_EXAMINE_TIMEOUT_MS` | `30000` (existing) | Overall examine hard-stop; may be raised for interactive discovery. |

---

## Mapping to requirements

| Requirement | Model support |
|-------------|---------------|
| FR-001, FR-002 | Interactive frame-aware discovery produces `ResolvedSource[]`; no persistence needed |
| FR-003, US2 | `run()` iterates `ResolvedSource[]`; new `ALL_SOURCES_FAILED` on exhaustion |
| FR-004 | `StreamHeaders` threaded into `yt-dlp` probe + download of `streamUrl` |
| FR-005, FR-006 | Reused atomic finalize + `insertFileNode` + keep-both naming; title from probe |
| FR-007, US3 | Unchanged `DetectedVideoCandidate`/`Format`; best-quality default, tolerant selection |
| FR-008, FR-009 | Extended `error_code` taxonomy incl. `ALL_SOURCES_FAILED`; geo folded into inaccessible |
| FR-010, Principle I/II | Every `streamUrl`/embed host url-guarded; per-job isolated credential-less context |
| FR-011 | All 002 caps/quota/concurrency/history reused; `downloads` row unchanged |
| FR-012 | Class-based discovery (no domain hard-coding); unsupported page → `NO_VIDEO_FOUND` |
