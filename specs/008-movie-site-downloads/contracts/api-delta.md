# API Contract Delta: Download Movies from Embed-Based Streaming Sites

**No new endpoints. No changed request shapes. No new HTTP status codes.** This feature is a
backend extraction/orchestration change behind the **existing** feature-002 download endpoints
(see `specs/002-url-video-download/contracts/openapi.yaml`). The full contract there still applies
unchanged; this document records only the deltas so a reviewer does not need to diff two OpenAPI
files.

All endpoints remain under the `/api` session-authenticated, default-deny guard, owner-scoped, with
a uniform `404` for non-owned/non-existent ids (Principle II). Served over TLS in production.

## Endpoints — unchanged surface

| Method & path | Change |
|---------------|--------|
| `POST /api/downloads/examine` | Same request `{ url }`. Same response shape (`videoFound`, `directFile`, `candidates[]`). **Additive only:** a candidate MAY include an optional `sourceLabel` string. Existing clients ignore unknown fields. |
| `POST /api/downloads` | Unchanged: `{ url, destinationFolderId?, formatId? }` → `201` job DTO. |
| `GET /api/downloads` · `GET /api/downloads/:id` | Unchanged DTO. `errorCode` may now be `ALL_SOURCES_FAILED` (see below). |
| `POST /api/downloads/:id/cancel` · `POST /api/downloads/:id/retry` | Unchanged. |
| `DELETE /api/downloads` · `DELETE /api/downloads/:id` | Unchanged. |

## Response deltas (additive, backward-compatible)

### 1. New `errorCode` value on the Download DTO

`errorCode` (string, nullable) gains one value:

- **`ALL_SOURCES_FAILED`** — a movie page offered one or more embedded sources but none produced a
  downloadable stream (FR-003, FR-008). `errorMessage` carries the human-readable reason, e.g.
  *"None of this page's video sources could be downloaded."*

`SOURCE_INACCESSIBLE` now also covers **geo-blocked** streams (region lock), reported — not bypassed
(FR-008, FR-009). Its `errorMessage` names the reason where the source exposes it.

No new failure maps to a new HTTP status: as today, `examine` surfaces
inaccessible/DRM as `422`; asynchronous download failures are reported via the job DTO's
`status: "failed"` + `errorCode`/`errorMessage` (polled through `GET /downloads`), not an HTTP
error.

### 2. Optional `sourceLabel` on `DetectedVideoCandidate`

```jsonc
// POST /downloads/examine → 200 (additive field shown)
{
  "videoFound": true,
  "directFile": false,
  "candidates": [
    {
      "candidateId": "…",
      "title": "Movie Title",
      "durationSec": 5400,
      "sourceLabel": "player.example",   // NEW, optional, may be null/absent
      "formats": [
        { "formatId": "hls-1080", "quality": "1080p", "width": 1920, "height": 1080, "ext": "mp4", "estimatedBytes": null }
      ]
    }
  ]
}
```

`estimatedBytes` is frequently `null` for HLS movie streams (size is unknown until fetched); the
per-download size cap is then enforced mid-stream by byte counting, exactly as in feature 002.

## Behavioural contract (not wire-visible, but pinned for tests)

- **Examine is a best-effort preview.** It returns within `DOWNLOAD_EXAMINE_TIMEOUT_MS`, attempting
  the fast static path then interactive discovery of the first working source(s). The **worker is
  authoritative**: after `POST /downloads`, `run()` performs the full ordered multi-source discovery
  under the per-download time cap. So a movie may still download even if a slow examine surfaced only
  one quality — consistent with feature 002, whose create-time probe is explicitly "not fatal."
- **Selection is tolerant.** A `formatId` from examine that no longer exists on the source `run()`
  lands on falls back to best quality (no error) — see research R5.
- **No request ever carries stream headers from the client.** Referer/Origin/UA/Cookie are captured
  server-side inside the sandbox and never accepted from or returned to the client.

## Security contract (unchanged, re-asserted)

- Every URL the server follows or fetches — submitted page, each embed/iframe host, resolved stream
  URL — passes `lib/url-guard` before any byte is fetched; embed-following is **not** an SSRF bypass
  (FR-010). Blocked hosts are dropped silently (generic error, no internal detail).
- `yt-dlp` is invoked only with an argument array; captured headers are discrete argv values.
- The sandbox context is isolated and credential-less per job; no cookie/token crosses jobs or users
  (Principle II).
