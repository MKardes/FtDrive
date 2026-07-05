# Implementation Plan: Download Videos from Web Pages to Drive

**Branch**: `002-url-video-download` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-url-video-download/spec.md`

## Summary

Let a signed-in FtDrive user paste a web-page (or direct video) URL, have the server examine
the page for downloadable video, and save the chosen video **directly into the user's own
drive** as an ordinary file (thumbnail, playback, rename/move/delete like any upload).
Downloads run **server-side in the background** so they survive the user disconnecting or the
server restarting, with live progress, cancel, retry, and a per-user history.

**Technical approach**: Extend the existing feature-001 Fastify backend with a new
`downloads` domain module and a durable, **SQLite-backed job queue** driven by an in-process
**worker pool** (concurrency capped at 5 per user, per the clarification). Video discovery
uses a **hybrid** strategy (FR-019): a local **`yt-dlp`** binary (spawned, no SaaS — the same
"local tool" posture as the existing `ffmpeg`) probes pages and direct links for candidates and
downloads the bytes (reassembling HLS/DASH segments via `ffmpeg`); when `yt-dlp` finds nothing,
a **headless browser** (Playwright's Chromium, already in the stack for E2E) renders the page in
a sandboxed context to discover media/manifest URLs, which are then handed back to the
downloader. Every fetched URL passes an **SSRF guard** (scheme allowlist + DNS resolution +
private/loopback/link-local/self rejection, re-checked across redirects) so the feature can
never probe the owner's internal network (FR-013). Completed bytes are finalized through the
**existing atomic temp→fsync→rename→commit** storage path and `insertFileNode`, so an
interrupted, cancelled, or failed download never leaves a visible partial/corrupt file
(FR-010). Posters/playback reuse the existing `MediaService`. Per-download **time and size
caps** plus a **per-user storage quota** bound resource use (FR-014/FR-020). The React SPA gains
a "Download from web" dialog (paste URL → review detected video(s) → confirm) and a **Downloads
panel** that polls status/progress and offers cancel/retry/clear-history. All endpoints live
under the existing `/api` default-deny auth guard and are strictly owner-scoped (uniform 404 for
anything not owned).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS (ESM) — unchanged from feature-001.

**Primary Dependencies**:
- Existing (reused): Fastify, Drizzle ORM + `better-sqlite3`, `zod`, `pino`, `sharp`, the
  `ffmpeg` system binary, `@fastify/cookie`, `ulidx`; React 18 + Vite + TanStack Query on the
  frontend.
- **New system binary**: `yt-dlp` (spawned, not bundled) — the extraction/download engine for
  pages, hosting sites, and segment-based streams; uses the already-required `ffmpeg` for
  muxing/segment merge. Local tool, no SaaS.
- **New library**: `playwright` (Chromium) for the headless-fallback page render. Playwright is
  already the project's E2E tool; this reuses its browser at runtime for the discovery fallback
  only. Node's built-in `undici`/`fetch` + `node:dns`/`node:net` power the SSRF-guarded direct
  fetch. No queue broker, no external services.

**Storage**:
- Metadata: the existing SQLite database gains one table, **`downloads`** (job queue + per-user
  history + origin link to the resulting node). No change to `users`/`nodes`/`sessions`.
- File content: unchanged per-user roots (`DATA_ROOT/users/<userId>/blobs/…`, thumbs under
  `…/thumbs/…`); downloads stream into the existing per-user `tmp` dir and commit atomically.

**Testing**: Vitest backend unit + API integration (Fastify `inject`), including **per-user
isolation negative tests** (a user cannot see/cancel/retry another user's download → uniform
404), **SSRF-guard** tests (private/loopback/self URLs refused), **atomicity** tests (failed
/cancelled download leaves no node and no temp), and **cap/quota** tests. External tools
(`yt-dlp`, browser, network) are mocked/faked at the process boundary in unit/integration tests;
Playwright E2E covers the paste→review→download→play journey using a local fixture video/page.

**Target Platform**: Single self-hosted Linux server (non-root service user); modern desktop +
mobile browsers for the SPA. Adds host prerequisites: `yt-dlp` on `PATH` and a Playwright
Chromium install (documented in quickstart, like `ffmpeg`).

**Project Type**: Web application — extends the existing `backend/` API and `frontend/` SPA;
new backend module `modules/downloads/` plus a shared `lib/url-guard`, and new frontend
`features/downloads/` + components.

**Performance Goals**:
- Examination (incl. headless fallback) returns candidates within a bounded timeout (default
  30 s) so paste→review→confirm stays ≤ 3 steps / < 30 s for a typical page (SC-001).
- Downloads are I/O-bound and source-limited; the 5-per-user worker cap keeps browsing, upload,
  and preview responsive while downloads run (SC-006).
- Progress visible via lightweight polling (TanStack Query) while any download is active.

**Constraints**:
- Every download path authenticated; default deny (Principle I) — endpoints sit under the
  existing `/api` guard.
- Per-user isolation: `downloads` queries filtered by `owner_id` **and** re-checked; non-owned
  or non-existent → the same `404 NOT_FOUND` (Principle II). Destination folder resolved via the
  existing `resolveOwnedFolderOrThrow404`; resulting node owned by the requester.
- **SSRF**: refuse non-http(s) schemes and any URL resolving to private/loopback/link-local/
  reserved/self addresses, re-validated after each redirect (FR-013).
- **Integrity**: reuse atomic temp→fsync→rename→commit; a download becomes a node only after full
  success; cancel/fail/restart discard the temp — no partial/corrupt file ever visible (FR-010).
- **Bounds**: per-download max wall-clock time AND absolute size ceiling; per-user storage quota;
  5 concurrent downloads per user with queueing (FR-014/FR-015/FR-020) — all config defaults.
- **No shell injection**: external tools spawned with argument arrays, never a shell string;
  URLs passed as args, never interpolated into a command line.
- Secrets/config from environment only; no telemetry. The feature's only outbound traffic is the
  user-initiated fetch of the requested content (documented, opt-in by use).

**Scale/Scope**: Household/small-group instance — tens of users, a handful of concurrent
downloads per user (cap 5), videos up to the configured per-download ceiling (default 20 GB) and
the per-user storage quota. Low overall concurrency.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial evaluation: **PASS** — no principle violated. Two items carry added complexity that is
justified in Complexity Tracking (headless browser; external `yt-dlp` binary), not principle
violations.

| Principle | How this plan complies |
|-----------|------------------------|
| **I. Security & Authentication First** (NON-NEGOTIABLE) | All download endpoints sit under the existing global `/api` default-deny auth guard; input validated with Fastify/zod schemas; **SSRF guard** blocks internal/self/redirected addresses (FR-013); external tools spawned with **argument arrays** (no shell, no injection); caps/quota bound resource use (FR-014/020); secrets from env; auth/security events logged without secrets. |
| **II. Strict Per-User Data Isolation** (NON-NEGOTIABLE) | `downloads.owner_id` filter at the data-access layer **and** re-checked before returning; opaque ULIDs; **uniform 404** for non-owned/non-existent downloads (no existence disclosure via id, error, or timing); destination resolved with `resolveOwnedFolderOrThrow404`; resulting node + history + progress visible only to the owner; isolation proven with negative integration tests (gating). |
| **III. Self-Hosted Data Ownership** | Job queue is local SQLite; `yt-dlp`, `ffmpeg`, and the headless Chromium are **local tools** on the owner's box (no SaaS, no telemetry); bytes stay on per-user local roots. The **only** outbound traffic is fetching the content the user explicitly asked for — a documented, user-initiated pull; **no user data is sent out**. The feature degrades to "unavailable" (rest of FtDrive unaffected) if the tools are absent — it is opt-in, not a mandatory dependency of core storage. |
| **IV. Media-First, Intuitive UI** | Downloaded videos become normal nodes with `ffmpeg` posters and in-browser playback; a paste-URL dialog with detected-video review and a responsive **Downloads panel** (states + live progress + cancel/retry) reachable without docs; explicit loading/error/empty states. |
| **V. Reliable Sync & Data Integrity** | Reuses atomic temp→fsync→rename→commit + `insertFileNode`; node appears only on full success; cancel/fail/restart discard the temp (existing sweeper) — never a visible partial/corrupt file (FR-010); durable job state + startup reconciliation means downloads survive disconnect and restart; destructive history-clear is per-user and does not delete the resulting file (that goes through normal reversible trash). |
| **Security & Privacy Requirements** | Served over TLS via the existing reverse proxy; service stays non-root/least-privilege; the spawned tools run under resource/time limits in a scratch dir; deploy guidance recommends egress filtering / a network namespace for the tool sandbox; no phone-home — outbound is only the user-requested fetch, documented and toggleable (`DOWNLOADS_ENABLED`). |
| **Development Workflow & Quality Gates** | This gate precedes Phase 0; isolation + SSRF + atomicity changes carry gating negative tests; secrets externalized; a new migration (`0002_downloads`) is append-only and data-preserving; complexity (headless browser, external binary) is justified below rather than left silent. |

## Project Structure

### Documentation (this feature)

```text
specs/002-url-video-download/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml      # REST API contract for the downloads endpoints
│   └── README.md         # Contract overview + conventions
├── checklists/
│   └── requirements.md   # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

New and changed paths are marked; everything else is existing feature-001 code reused as-is.

```text
backend/
├── src/
│   ├── config/
│   │   └── index.ts               # CHANGE: add download env (enabled, tool paths, caps, quota, concurrency)
│   ├── db/
│   │   ├── schema.ts              # CHANGE: add `downloads` table (Drizzle)
│   │   └── migrations/
│   │       ├── 0002_downloads.ts  # NEW: append-only migration creating `downloads`
│   │       └── index.ts           # CHANGE: register m0002_downloads
│   ├── lib/
│   │   └── url-guard.ts           # NEW: SSRF guard (scheme allowlist, DNS resolve, private/self block, redirect re-check)
│   ├── modules/
│   │   └── downloads/             # NEW: the downloads domain
│   │       ├── routes.ts          #   examine, create, list, get, cancel, retry, clear-history
│   │       ├── repository.ts      #   DownloadRepository: owner-scoped CRUD, claim, status transitions
│   │       ├── service.ts         #   orchestration (enqueue/examine/cancel/retry/history)
│   │       ├── worker.ts          #   in-process worker pool: claim queued jobs, run pipeline, update progress
│   │       ├── pipeline.ts        #   examine→download→finalize; caps watchdog; temp→commit→insertFileNode
│   │       ├── extractor.ts       #   yt-dlp wrapper: probe candidates, resolve format, download bytes (spawn, arg-array)
│   │       └── browser-probe.ts   #   headless-fallback: render page, capture media/manifest URLs
│   ├── media/index.ts             # reused: ensureThumbnail (posters for downloaded video)
│   ├── storage/index.ts           # reused: writeStreamToTemp/commitTemp/discardTemp (atomic finalize)
│   ├── jobs/maintenance.ts        # CHANGE: on startup reconcile in-flight downloads; keep temp sweep
│   ├── services.ts                # CHANGE: add `downloads` repo + start/stop the worker pool
│   └── app.ts                     # CHANGE: registerDownloadRoutes under /api
└── tests/
    ├── integration/               # NEW: downloads API + ISOLATION negatives, SSRF blocked, atomicity, caps/quota
    └── unit/                      # NEW: url-guard, extractor (mocked spawn), pipeline finalize

frontend/
├── src/
│   ├── features/downloads/        # NEW: hooks (useExamineUrl, useCreateDownload, useDownloads, cancel/retry/clear) + api client types
│   ├── components/                # NEW: DownloadUrlDialog, CandidatePicker, DownloadsPanel, DownloadRow (progress)
│   ├── pages/                     # CHANGE: Downloads view/route (or panel in app shell) + entry button
│   └── app/                       # CHANGE: nav entry to Downloads
└── tests/                         # NEW: component tests for the dialog/panel

e2e/
└── tests/downloads.spec.ts        # NEW: paste URL → review → download → play (desktop + mobile), using a local fixture
```

**Structure Decision**: Reuse the established feature-001 web-application layout. The feature is
a new **backend domain module** (`modules/downloads/`) plus one shared cross-cutting guard
(`lib/url-guard.ts`), threaded through the existing `Services` container and registered under the
existing `/api` guard — mirroring how `nodes`, `files`, and `trash` are organized so that auth,
isolation, atomic-write, and media choke points stay shared and testable. The durable queue is
one new SQLite table with an in-process worker pool started alongside the existing maintenance
job; no new service or broker is introduced, matching Principle III and the simplicity mandate.

## Complexity Tracking

These are added-complexity items (not constitution violations); each is justified and the simpler
alternative recorded per the Development Workflow gate.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| **Headless browser (Playwright Chromium) as a discovery fallback** | FR-019 (clarified): many modern sites expose video only after client-side JS runs; static extraction alone cannot find it. | **Static-only** was rejected in clarification — it fails the site coverage the owner asked for. Mitigations: used only when `yt-dlp` finds nothing; runs sandboxed under resource/time limits in a scratch dir with no credentials; discovered URLs still pass the SSRF guard; reuses the browser already in the stack (no new tool class). |
| **External `yt-dlp` binary** as extractor/downloader | Robustly handles pages, hosting sites, and HLS/DASH segment reassembly — the core of the feature; parallels the existing local `ffmpeg` dependency. | **Building a custom extractor** was rejected — brittle and enormous to maintain as sites change. `yt-dlp` is a local, self-hosted tool (no SaaS/telemetry), spawned with an argument array (no injection), version-pinned and documented as a host prerequisite; the feature degrades to "unavailable" without it, so it is not a mandatory dependency of core storage. |
| **New per-user storage quota** concept | FR-014 requires refusing/stopping downloads that exceed the user's available space; feature-001 has only a per-*file* upload limit, no per-user total. | Relying on the per-file limit alone was rejected — it cannot bound cumulative growth from repeated downloads. Implemented minimally as a config-driven quota (`0` = unlimited default) computed from `SUM(size)` of the user's live file nodes, enforced pre-flight and mid-stream. |

*Post-Design Constitution Re-Check (after Phase 1): **PASS**. The data model scopes every
`downloads` row by `owner_id` with a uniform not-found response and links the resulting node as
origin only; the API contract requires authentication on every endpoint, exposes no cross-user
surface, and refuses disallowed/internal URLs; finalize reuses the atomic write path so no
partial file can appear; caps, quota, and the 5-per-user concurrency limit bound resource use.
No new external service, network broker, or outbound telemetry was introduced beyond the
documented, user-initiated content fetch.*
