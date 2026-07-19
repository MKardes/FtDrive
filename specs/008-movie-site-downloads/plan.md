# Implementation Plan: Download Movies from Embed-Based Streaming Sites

**Branch**: `008-movie-site-downloads` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-movie-site-downloads/spec.md`

## Summary

Extend the existing download-from-web pipeline (`002-url-video-download`) so it succeeds on the
class of movie streaming sites (example: `hdfilmcehennemi.nl`) where the video does not play on the
submitted page itself. On those pages the movie plays inside a third-party player embedded via
iframe(s), the real stream (typically an HLS `.m3u8`) is requested only after the player starts and
is rejected unless fetched with the originating player's request context (Referer/Origin/User-Agent
and sometimes a short-lived token), and the same movie is offered through several alternative
"source" servers.

The technical approach makes the **headless-fallback path do real work** and then **threads the
resolved stream and its request context through to the download**:

1. **Interactive, frame-aware discovery** — the sandboxed Chromium probe enumerates the page's
   embed/source candidates (iframe `src`s and inline players, in DOM order = the site's alternative
   sources), and for each candidate in turn: triggers playback (click the player / call
   `video.play()`), waits (bounded) for a media/manifest request, and **captures that request's URL
   together with the headers that made it succeed** (Referer, Origin, User-Agent, Cookie).
2. **Context-aware extraction** — the captured stream URL and its headers are handed to `yt-dlp`
   via explicit `--referer` / `--user-agent` / `--add-header` flags (argument-array, never a shell
   string) for both format probing and the actual download, so streams that 403 a context-less
   request now download.
3. **Automatic multi-source fallback** — the pipeline carries the ordered list of resolved sources
   and, at download time, tries them in order until one completes; only when all are exhausted does
   it report `ALL_SOURCES_FAILED` (US2 / FR-003).

This also fixes a latent gap in feature 002: `run()` currently downloads from `job.sourceUrl` using
a `formatId` that was probed from a *different* browser-discovered URL, and `browser-probe`
discards request headers — so 002's headless path never actually downloaded protected embedded
streams. This feature threads the discovered media URL + headers all the way through.

**No new database table, no new migration, no new runtime dependency, no new anonymous route.**
`yt-dlp` and Playwright/Chromium are already prerequisites; the resolved stream URL and headers are
transient (re-resolved per run), so nothing new is persisted on the `downloads` row.

## Technical Context

**Language/Version**: TypeScript (Node.js 22), React 18 (frontend, essentially untouched).

**Primary Dependencies**: Fastify, SQLite/Drizzle, TanStack Query — all unchanged. Local host tools
already required by feature 002: **`yt-dlp`** (extract/download engine) and **`ffmpeg`** (segment
merge) spawned via argument array; **Playwright/Chromium** (headless discovery). No dependency is
added by this feature.

**Storage**: Existing SQLite `downloads` table (feature 002) reused **as-is** — no columns, no
migration. Resulting movie is an ordinary `nodes` file created through the existing atomic
temp→commit path. Resolved stream URL + request headers are in-memory only.

**Testing**: Vitest integration tests under `backend/tests/integration/` with the extractor and
browser probe faked through their existing injection seams (`Extractor`, `BrowserProbeLike`).

**Target Platform**: Self-hosted Linux server (single process), served over TLS via reverse proxy.

**Project Type**: Web application (Fastify backend + React/Vite frontend). Work is backend-only in
the `modules/downloads/` module plus config; the frontend surface (paste-URL dialog, candidate/
quality picker, downloads panel) is reused unchanged — new failure text arrives via the existing
`errorMessage` field.

**Performance Goals**: Examination stays bounded by `DOWNLOAD_EXAMINE_TIMEOUT_MS`; per-source
playback wait is bounded by a new `DOWNLOAD_PLAYBACK_WAIT_MS`; the number of alternative sources
tried is bounded by a new `DOWNLOAD_MAX_SOURCES`. The long download runs in the background worker
under the existing per-download time cap (`DOWNLOAD_MAX_DURATION_MS`) and size cap
(`DOWNLOAD_MAX_BYTES`). Concurrency stays at 5 active jobs per user.

**Constraints**: Every URL followed or fetched — page, each embed host, the stream playlist — must
pass the existing SSRF `url-guard`. The sandbox context stays credential-less and isolated per job
(no shared cookies across users or jobs). `yt-dlp` is only ever invoked with an argument array.
Copy-protection (DRM) is out of scope and reported, never bypassed.

**Scale/Scope**: Household self-hosted scale; a handful of concurrent movie downloads. Scope is one
backend module's discovery + extraction + orchestration changes plus ~3 new config knobs and new
integration tests; no UI redesign (feature 007 already owns the UI shell the dialog lives in).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

- **I. Security & Authentication First (NON-NEGOTIABLE)** — PASS. No new route or anonymous path:
  the feature reuses the existing session-authenticated, default-deny `/api/downloads/*` surface.
  `yt-dlp` remains argument-array-spawned; the newly captured Referer/Origin/User-Agent/Cookie are
  passed as discrete `--referer`/`--user-agent`/`--add-header` argv values (no shell, no injection).
  The captured `Cookie` originates only from the job's own isolated, credential-less sandbox
  context — never a user's real session. Interactive playback executes site JS inside that sandbox,
  which 002 already did on load; the marginal addition (clicking/`play()`) is tracked in Complexity
  Tracking with the same deploy-time egress-sandbox recommendation.
- **II. Strict Per-User Data Isolation (NON-NEGOTIABLE)** — PASS. Unchanged isolation model: all
  access goes through the owner-scoped `DownloadRepository` with a uniform 404 for non-owned/
  non-existent ids. Each job's browser context is fresh and isolated, so cookies/tokens discovered
  for one job/user never leak into another. No new identifiers are exposed.
- **III. Self-Hosted Data Ownership** — PASS. `yt-dlp`, `ffmpeg`, and Chromium are local; no SaaS,
  no telemetry, no new dependency. The only outbound traffic remains the user-initiated content
  fetch (now including the embed hosts and stream/segment hosts for the requested movie).
- **IV. Media-First, Intuitive UI** — PASS. The result is a normal, previewable, playable file. The
  feature makes more real-world pages succeed through the same paste-URL flow; no capability is
  removed and no documentation is required to use it.
- **V. Reliable Sync & Data Integrity** — PASS. Atomic finalize is unchanged: a node appears only
  on full success. Multi-source fallback discards the scratch temp between attempts so no partial
  file is ever visible; all caps (size, time, quota) still bound each attempt.
- **Security & isolation are gating** — Addressed by new negative tests: SSRF guard rejects an
  embed/stream host that resolves internal; isolation holds across jobs; DRM/geo/inaccessible are
  reported not bypassed. See quickstart.md and Phase 1.
- **Simplicity** — PASS. No new table, dependency, or service; the change is confined to one module
  plus 3 env knobs. Added complexity (interactive playback, header threading, source loop) is the
  minimal set that makes the named class of sites work; the simpler static-only path is already
  proven insufficient for these pages.

**Result: PASS (no unjustified violations).** One residual risk is carried forward and tracked, not
a gate failure — see Complexity Tracking.

**Post-Design re-check (after Phase 1)**: Still PASS. The design added no table, no migration, no
dependency, and no new route or anonymous path (data-model.md, contracts/api-delta.md). Isolation is
unchanged (owner-scoped repository, per-job credential-less sandbox). The only new attack surface —
interactive playback + per-segment fetch — is the same residual risk recorded in Complexity
Tracking, mitigated by url-guarding every embed/stream host up front and the documented deploy-time
egress sandbox. No principle regressed between Phase 0 and Phase 1.

## Project Structure

### Documentation (this feature)

```text
specs/008-movie-site-downloads/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — extraction/discovery decisions
├── data-model.md        # Phase 1 output — reused entities + transient discovery shapes
├── quickstart.md        # Phase 1 output — validation scenarios
├── contracts/
│   └── api-delta.md      # Phase 1 output — no new endpoints; error-code + field deltas
├── checklists/
│   └── requirements.md   # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/
│   │   └── index.ts                     # + DOWNLOAD_MAX_SOURCES, DOWNLOAD_PLAYBACK_WAIT_MS (examine timeout may be raised)
│   └── modules/downloads/
│       ├── browser-probe.ts             # CHANGED: enumerate embed/source candidates, trigger playback,
│       │                                #          traverse frames, capture stream URL + request headers
│       ├── extractor.ts                 # CHANGED: pass Referer/UA/headers to probe() + download();
│       │                                #          extend inaccessible/geo failure classification
│       ├── pipeline.ts                  # CHANGED: examine() returns ordered resolved sources w/ context;
│       │                                #          run() loops sources until one completes (ALL_SOURCES_FAILED)
│       ├── service.ts                   # CHANGED: best-effort examine preview; new error-code mapping
│       ├── worker.ts                    # unchanged (claim/cancel/reconcile as-is)
│       ├── repository.ts                # unchanged (no schema change)
│       └── routes.ts                    # unchanged endpoints; maps new codes to existing HTTP statuses
└── tests/integration/
    ├── downloads-embed-source.test.ts   # NEW: iframe/embed → stream discovery
    ├── downloads-source-fallback.test.ts# NEW: first source fails → later source succeeds; all fail → ALL_SOURCES_FAILED
    ├── downloads-stream-headers.test.ts # NEW: protected stream needs Referer/headers to fetch
    ├── downloads-geo-inaccessible.test.ts# NEW: geo/login reported, not silent
    └── isolation-downloads.test.ts      # EXTEND: isolation + SSRF still hold with embed following

frontend/
└── src/                                 # Reused unchanged: DownloadUrlDialog, CandidatePicker,
                                         # DownloadsPanel — new failure text arrives via errorMessage
```

**Structure Decision**: This is the established feature-001 web-app layout. All behavior change is
inside `backend/src/modules/downloads/` (discovery, extraction, orchestration) plus a few env knobs
in `backend/src/config/index.ts`. The frontend is intentionally untouched: the examine → candidate/
quality picker → create flow and the downloads progress panel already render everything this feature
produces, and human-readable failure reasons flow through the existing `errorMessage` field.

## Complexity Tracking

> Only the one residual risk below needs justification; the Constitution Check otherwise passes.

| Violation / Risk | Why Needed | Simpler Alternative Rejected Because |
|------------------|------------|--------------------------------------|
| Sandbox now **interacts** with the page (clicks / `video.play()`) and executes each embed's player JS to reveal the stream | These sites gate the stream URL behind playback start inside a cross-origin player; without triggering it, no stream is ever requested and the movie is undiscoverable | Static/manifest-only extraction (feature 002's default) already returns "no video found" for this whole class of sites — proven insufficient |
| `yt-dlp`'s own subsequent **segment fetches** are not individually re-validated by the SSRF guard | The stream is HLS/DASH; yt-dlp fetches many segments itself and cannot be made to call our guard per segment without reimplementing it | Reimplementing a segment fetcher is a large, brittle duplication; mitigated by guarding the entry page + each embed host + the resolved playlist URL up front, and by the documented deploy-time network-namespace/egress filter (same posture as feature 002, unchanged residual risk) |
