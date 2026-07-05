---

description: "Task list for Download Videos from Web Pages to Drive (002-url-video-download)"
---

# Tasks: Download Videos from Web Pages to Drive

**Input**: Design documents from `/specs/002-url-video-download/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, contracts/README.md, quickstart.md (all present)

**Tests**: Included. The constitution (see plan.md's Constitution Check) makes isolation, SSRF,
atomicity, and cap/quota negative tests **gating** for this feature — they are not optional, and
research.md §11 spells out exactly which suites are required. Non-gating unit/integration tests are
included too, mirroring feature-001's existing test layout (`backend/tests/unit/`,
`backend/tests/integration/`, `frontend/tests/`, `e2e/tests/`).

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3) so each can be implemented and
verified independently on top of one shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Maps the task to US1/US2/US3
- Every task names an exact file path

## Path Conventions (extends feature-001's layout; see plan.md § Project Structure)

- Backend: `backend/src/...`, `backend/tests/unit/...`, `backend/tests/integration/...`
- Frontend: `frontend/src/...`, `frontend/tests/...`
- E2E: `e2e/tests/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Host/dependency/config groundwork before any downloads code is written.

- [X] T001 Add download-feature environment variables (`DOWNLOADS_ENABLED`, `YT_DLP_PATH`,
      `DOWNLOAD_MAX_CONCURRENCY_PER_USER`, `DOWNLOAD_MAX_BYTES`, `DOWNLOAD_MAX_DURATION_MS`,
      `DOWNLOAD_EXAMINE_TIMEOUT_MS`, `USER_STORAGE_QUOTA_BYTES`, `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES`)
      to the zod `EnvSchema` and `AppConfig` in `backend/src/config/index.ts`, with the defaults from
      research.md §10 / quickstart.md
- [X] T002 [P] Add `playwright` as a runtime dependency of `backend/package.json` (headless
      Chromium fallback engine, FR-019) — pin the same major version already used by `e2e/package.json`

**Checkpoint**: Config validates fail-fast with the new vars; `playwright` installable in `backend/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `downloads` data model, SSRF guard, extraction/pipeline/worker machinery, and
service wiring that **every** user story depends on. No story-specific route handler exists yet.

**⚠️ CRITICAL**: No user story phase may begin until this phase is complete and the app still boots.

- [X] T003 Add the `downloads` Drizzle table to `backend/src/db/schema.ts` per data-model.md
      (`id`, `ownerId` FK cascade, `sourceUrl`, `destinationParentId`, `selection`, `title`,
      `status` enum, `bytesDownloaded`, `totalBytes`, `nodeId`, `errorCode`, `errorMessage`,
      `attempt`, `createdAt`, `updatedAt`, `startedAt`, `finishedAt`) plus the three indexes
      (`owner_id,created_at`; `owner_id,status`; `status,created_at`); export `DownloadRow`/`NewDownloadRow`
- [X] T004 Create `backend/src/db/migrations/0002_downloads.ts` — hand-authored `CREATE TABLE downloads`
      + matching `CREATE INDEX` statements mirroring T003's columns (append-only, data-preserving,
      same style as `0001_init.ts`)
- [X] T005 Register `m0002_downloads` in the `migrations` array of `backend/src/db/migrations/index.ts`
- [X] T006 [P] Create `backend/src/lib/url-guard.ts` — the shared SSRF guard (research.md §4):
      allow only `http`/`https`, resolve the host via DNS, reject loopback/private(RFC1918)/
      link-local/unique-local/CGNAT/reserved/multicast/self-interface addresses, and re-validate at
      each redirect hop (connect to the validated IP); generic rejection error, no internal detail
      leaked; `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES` opt-out
- [X] T007 [P] Unit tests for the SSRF guard in `backend/tests/unit/url-guard.test.ts` — loopback,
      private, link-local, self-address, and redirect-to-internal are rejected; public HTTP(S) URLs
      pass (gating per research.md §11)
- [X] T008 Create `backend/src/modules/downloads/repository.ts` — `DownloadRepository`: insert,
      `getOwnedDownloadOrThrow404` (owner-scoped + uniform 404, mirrors `NodeRepository`),
      `listByOwner` (keyset pagination, active/terminal status filter), `countActiveForOwner`,
      `claimNextQueued` (single transaction: pick the oldest `queued` row for a user whose active
      count is `< DOWNLOAD_MAX_CONCURRENCY_PER_USER`, mark `examining`, set `startedAt` — enforces
      FR-015), status-transition setters (`markExamining/Downloading/Completed/Failed/Canceled`),
      progress setter (`setProgress(bytesDownloaded, totalBytes)`), `clearTerminalForOwner` (FR-017),
      `deleteOneTerminal`
- [X] T009 Create `backend/src/modules/downloads/extractor.ts` — the `yt-dlp` wrapper (research.md
      §1): `probe(url)` spawns `yt-dlp --dump-single-json …` (argument array, never a shell string)
      and parses candidates/formats (title, duration, per-format quality/width/height/ext/estimated
      size); `download(url, formatId, destPath, onProgress)` spawns the download with
      `--newline --progress-template` and reports bytes/total via `onProgress`; `isAvailable()` health
      check for `DOWNLOADS_ENABLED`/missing-binary degradation
- [X] T010 [P] Unit tests for the extractor in `backend/tests/unit/extractor.test.ts` — candidate/
      format JSON parsing, progress-line parsing, and argument-array construction (spawn mocked, no
      real `yt-dlp` invocation)
- [X] T011 Create `backend/src/modules/downloads/browser-probe.ts` — headless-fallback discovery
      (research.md §2): launch Playwright Chromium in a locked-down context (no stored credentials,
      isolated scratch profile dir, autoplay/download-to-disk disabled), render the page under a
      CPU/wall-clock cap, intercept network requests for media/manifest URLs (`.m3u8`/`.mpd`/video
      responses), and return them for extractor re-resolution; every discovered URL is passed back
      through `url-guard` (T006) before use
- [X] T012 Create `backend/src/modules/downloads/pipeline.ts` — orchestration used by the worker
      (research.md §6, data-model.md state machine): `examine(url)` = url-guard → extractor.probe →
      (no candidates) → browser-probe fallback → url-guard the discovered URL → re-probe; `runDownload(job)`
      = direct-file shortcut (FR-004) or resolved-format download → stream to
      `storage.writeStreamToTemp`/scratch file → on full success `storage.commitTemp` +
      `nodes.insertFileNode` (destination via `resolveOwnedFolderOrThrow404` or auto-created
      "Downloads" folder, name via `sanitizeUploadName` + `resolveAvailableName`) +
      `media.ensureThumbnail`; on cancel/fail/any exception `storage.discardTemp` and no node is ever
      created (FR-010)
- [X] T013 [P] Unit tests for pipeline finalize/caps logic in `backend/tests/unit/pipeline.test.ts` —
      a node is created only after a simulated full success; a simulated failure/cancel mid-stream
      discards the temp and creates no node (gating per research.md §11)
- [X] T014 Create `backend/src/modules/downloads/worker.ts` — in-process worker pool: on an interval,
      call `repository.claimNextQueued` per known active user, run `pipeline.examine`/`runDownload`,
      persist throttled progress (~1/s) via `repository.setProgress`, watch for a cancellation flag set
      by the repository and abort the in-flight spawn/stream when set, and enforce the per-download
      **wall-clock** (`DOWNLOAD_MAX_DURATION_MS`) and **size** (`DOWNLOAD_MAX_BYTES`) watchdogs (FR-020)
      that fail the job with a retryable `error_code`/`error_message` and free the slot; exposes
      `start()`/`stop()` for graceful shutdown
- [X] T015 Create `backend/src/modules/downloads/service.ts` — `DownloadService`: `examineUrl`
      (delegates to pipeline.examine, bounded by `DOWNLOAD_EXAMINE_TIMEOUT_MS`), `createDownload`
      (validates URL via url-guard, resolves/creates the default "Downloads" folder or the chosen
      owned folder, checks the per-download size ceiling and the user's remaining quota —
      `SUM(size)` of live nodes vs `USER_STORAGE_QUOTA_BYTES` — pre-flight, inserts a `queued` row),
      `listDownloads`, `getDownload`, `cancelDownload`, `retryDownload` (re-queues from
      `failed`/`canceled`, `attempt += 1`, bytes reset), `clearHistory`, `deleteOne`; every accessor
      goes through `repository.getOwnedDownloadOrThrow404`
- [X] T016 Create `backend/src/modules/downloads/routes.ts` exporting an empty
      `registerDownloadRoutes(api, services)` scaffold (no endpoints yet — story phases below add
      them one at a time into this same file)
- [X] T017 Wire `downloads` (repository + service) and the worker pool's `start()`/`stop()` into
      `backend/src/services.ts` (`Services` interface + `createServices`), following the existing
      `nodes`/`media` construction pattern
- [X] T018 Register `registerDownloadRoutes(api, services)` inside `registerApiRoutes` in
      `backend/src/app.ts`, under the existing `/api` default-deny guard
- [X] T019 Add startup reconciliation of in-flight downloads to
      `backend/src/jobs/maintenance.ts`'s `startMaintenanceJobs`: any row left `examining`/
      `downloading` from a crash is reset to `queued` (`attempt += 1`, `bytesDownloaded = 0`, temp
      discarded) or to `failed` (retryable) once attempts are exhausted — logged like the existing
      sweep events

**Checkpoint**: App boots with the `downloads` table, worker pool, and reconciliation running; no
HTTP surface yet. User story phases can now begin.

---

## Phase 3: User Story 1 - Download a video by pasting a page URL (Priority: P1) 🎯 MVP

**Goal**: Paste a URL → examine → confirm → the video is downloaded server-side and appears as an
ordinary, playable file in the user's drive.

**Independent Test**: Submit the URL of a page containing one accessible video and a direct-file
URL; verify each resulting video appears complete and playable in the correct user's drive (and
only there), and that a no-video page reports cleanly without adding anything.

### Tests for User Story 1

- [X] T020 [P] [US1] Integration test: examine + create happy path in
      `backend/tests/integration/downloads-examine-create.test.ts` — `POST /downloads/examine`
      returns `videoFound: true` for a page with one video (title/duration/formats); `POST /downloads`
      enqueues it; polling `GET /downloads/{id}` reaches `completed` with a `nodeId`; that node is
      visible in the destination folder with normal file behavior
- [X] T021 [P] [US1] Integration test: direct-file URL skips examination (FR-004) in
      `backend/tests/integration/downloads-direct-url.test.ts`
- [X] T022 [P] [US1] Integration test: no video found reports cleanly and adds nothing in
      `backend/tests/integration/downloads-no-video.test.ts` (`videoFound: false`, no row/side effect)
- [X] T023 [P] [US1] Integration test: every downloads endpoint denies unauthenticated access (401)
      in `backend/tests/integration/downloads-auth.test.ts` (FR-011) — gating

### Implementation for User Story 1

- [X] T024 [US1] Implement `POST /downloads/examine` in `backend/src/modules/downloads/routes.ts`
      (calls `service.examineUrl`; `400` disallowed/invalid URL, `422` DRM/inaccessible, `503` when
      downloads are disabled or `yt-dlp` is unavailable)
- [X] T025 [US1] Implement `POST /downloads` in `backend/src/modules/downloads/routes.ts` (calls
      `service.createDownload`; `400` disallowed URL/invalid `formatId`, `404` non-owned/missing
      `destinationFolderId`, `409` over size-ceiling/quota, `503` unavailable) — sequential after T024
      (same file)
- [X] T026 [US1] Implement `GET /downloads/{id}` in `backend/src/modules/downloads/routes.ts`
      (owner-scoped status/progress read; uniform `404`) — sequential after T025 (same file)
- [X] T027 [US1] Implement the default "Downloads" folder auto-create-if-missing helper in
      `backend/src/modules/downloads/service.ts` (FR-003), reusing `resolveOwnedFolderOrThrow404`/
      `insertFolderNode`-style creation
- [X] T028 [US1] Implement the direct-video-URL shortcut (skip `examining`, go straight to
      `downloading`) in `backend/src/modules/downloads/pipeline.ts` (FR-004)
- [X] T029 [US1] Add `downloads` methods (`examine`, `create`, `get`) to the typed API client in
      `frontend/src/api/client.ts`, and the `Download`/`DetectedVideoCandidate`/`Format` types to
      `frontend/src/api/types.ts` (mirrors `contracts/openapi.yaml`)
- [X] T030 [US1] Create `useExamineUrl` and `useCreateDownload` hooks in
      `frontend/src/features/downloads/hooks.ts` (TanStack Query mutations)
- [X] T031 [US1] Build `DownloadUrlDialog` in `frontend/src/components/DownloadUrlDialog.tsx` —
      paste URL → review the single detected video → confirm destination folder (default
      "Downloads") → submit
- [X] T032 [US1] Add a "Download from web" entry point wired to `DownloadUrlDialog` in
      `frontend/src/pages/Browse/index.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable — a pasted URL becomes
a playable file in the user's drive.

---

## Phase 4: User Story 2 - Track and manage downloads in progress (Priority: P2)

**Goal**: Live status/progress, cancel, retry, per-user history, and durability across disconnect
and server restart.

**Independent Test**: Start a large download, observe live progress, cancel it and confirm nothing
is added to the drive; start another, disconnect/reconnect (and simulate a restart), and confirm it
finished on its own; confirm history and control actions are strictly per-user.

### Tests for User Story 2

- [X] T033 [P] [US2] Integration test: `GET /downloads` reflects advancing
      `bytesDownloaded`/`totalBytes` for an active download in
      `backend/tests/integration/downloads-progress.test.ts`
- [X] T034 [P] [US2] Integration test: cancel discards partial data and creates no node/temp in
      `backend/tests/integration/downloads-cancel.test.ts` (FR-008) — gating atomicity
- [X] T035 [P] [US2] Integration test: a failed download shows a human-readable reason and
      `POST /downloads/{id}/retry` re-queues it in `backend/tests/integration/downloads-retry.test.ts`
      (FR-009)
- [X] T036 [P] [US2] Integration test: cross-user isolation — user A gets a uniform `404` from
      `GET`/`cancel`/`retry`/`DELETE` on user B's download in
      `backend/tests/integration/isolation-downloads.test.ts` (mirrors `isolation-suite.test.ts`) —
      gating (FR-012, SC-005)
- [X] T037 [P] [US2] Integration test: SSRF guard rejects loopback/private/self URLs at both examine
      and create, with no fetch performed, in `backend/tests/integration/downloads-ssrf.test.ts`
      (FR-013) — gating
- [X] T038 [P] [US2] Integration test: over-size, over-time, and over-quota downloads are
      refused (`409`) or stopped (`failed`, retryable), leaving no partial file, in
      `backend/tests/integration/downloads-caps.test.ts` (FR-014/FR-020) — gating
- [X] T039 [P] [US2] Integration test: a download left `examining`/`downloading` is re-queued (or
      failed if exhausted) by startup reconciliation, with its temp discarded, in
      `backend/tests/integration/downloads-reconciliation.test.ts`
- [X] T040 [P] [US2] Integration test: `GET /downloads` lists only the caller's history and
      `DELETE /downloads` clears it without deleting files in
      `backend/tests/integration/downloads-history.test.ts` (FR-017)

### Implementation for User Story 2

- [X] T041 [US2] Implement `GET /downloads` (keyset `cursor`/`limit`, `status=active|terminal`
      filter) in `backend/src/modules/downloads/routes.ts` — sequential after T026 (same file)
- [X] T042 [US2] Implement `POST /downloads/{id}/cancel` in `backend/src/modules/downloads/routes.ts`
      (`409` if already terminal) — sequential after T041
- [X] T043 [US2] Implement `POST /downloads/{id}/retry` in `backend/src/modules/downloads/routes.ts`
      (`409` unless `failed`/`canceled`; `503` unavailable) — sequential after T042
- [X] T044 [US2] Implement `DELETE /downloads` (clear terminal history) and `DELETE /downloads/{id}`
      (single record, `409` if still active) in `backend/src/modules/downloads/routes.ts` —
      sequential after T043
- [X] T045 [US2] Implement cancellation propagation in `backend/src/modules/downloads/worker.ts` +
      `pipeline.ts` — an `AbortController`/flag checked by the running `yt-dlp` spawn or fetch stream
      so cancel stops the transfer promptly and discards the temp
- [X] T046 [US2] Frontend: add `list`/`cancel`/`retry`/`clearHistory`/`deleteOne` methods to the
      `downloads` namespace in `frontend/src/api/client.ts`
- [X] T047 [US2] Create `useDownloads` (polling while any item is active), `useCancelDownload`,
      `useRetryDownload`, and `useClearHistory` hooks in `frontend/src/features/downloads/hooks.ts`
- [X] T048 [US2] Build `DownloadsPanel` and `DownloadRow` in
      `frontend/src/components/DownloadsPanel.tsx` and `frontend/src/components/DownloadRow.tsx` —
      state badges, progress bar, cancel/retry actions, clear-history control
- [X] T049 [US2] Add a routed Downloads page in `frontend/src/pages/Downloads/index.tsx`, register
      it in `frontend/src/app/App.tsx`, and add its nav entry in `frontend/src/app/AppLayout.tsx`

**Checkpoint**: User Stories 1 and 2 both work independently — downloads are visible, controllable,
isolated per user, bounded, and durable across disconnect/restart.

---

## Phase 5: User Story 3 - Choose among multiple detected videos or qualities (Priority: P3)

**Goal**: When a page has multiple videos or a video has multiple qualities, show the candidates
with distinguishing details and let the user pick; default to the best quality of the primary video
when nothing is chosen.

**Independent Test**: Submit a page with multiple videos, verify each candidate is shown with
title/duration/quality/estimated size, select one, and confirm only that one downloads; omit a
selection and confirm the highest-quality format is used.

### Tests for User Story 3

- [X] T050 [P] [US3] Integration test: examining a multi-video page returns every candidate with its
      formats in `backend/tests/integration/downloads-multi-candidate.test.ts`
- [X] T051 [P] [US3] Integration test: creating a download with an explicit `formatId` downloads
      only that candidate/format, and omitting `formatId` downloads the primary candidate's
      highest-quality format, in `backend/tests/integration/downloads-format-selection.test.ts`

### Implementation for User Story 3

- [X] T052 [US3] Extend `probe()` in `backend/src/modules/downloads/extractor.ts` to surface every
      detected candidate with its full format list (title, duration, quality, width, height, ext,
      estimated size) rather than just the primary one
- [X] T053 [US3] Implement `formatId` re-resolution at `examining` time in
      `backend/src/modules/downloads/pipeline.ts` (metadata/URLs may have expired since the examine
      call — re-probe and re-match the chosen candidate/format before downloading)
- [X] T054 [US3] Implement "no `formatId` chosen ⇒ highest-quality format of the primary candidate"
      selection logic in `backend/src/modules/downloads/service.ts`
- [X] T055 [US3] Build `CandidatePicker` in `frontend/src/components/CandidatePicker.tsx` — lists
      candidates with title/duration/quality/estimated size and lets the user pick one (and its
      format)
- [X] T056 [US3] Wire `CandidatePicker` into `DownloadUrlDialog` in
      `frontend/src/components/DownloadUrlDialog.tsx` for multi-candidate examine results

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and documentation once the user stories are complete.

- [X] T057 [P] Add the Playwright E2E journey in `e2e/tests/downloads.spec.ts` — paste → review →
      download → play, on desktop and a 360px mobile viewport, against a local fixture page/video
      (no live third-party site in CI), per research.md §11
- [X] T058 [P] Document the `yt-dlp` and Playwright-Chromium host prerequisites and the new
      environment variables (table from quickstart.md) in `docs/deployment.md`, alongside the
      existing `ffmpeg` prerequisite section
- [X] T059 Run `specs/002-url-video-download/quickstart.md` end-to-end against the implemented API
      and SPA; fix any drift between the guide and actual behavior
- [X] T060 Run the full suite (`npm run test`, `npm run typecheck`, `npm run test:e2e`) and resolve
      any regressions in feature-001 behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (T003→T004→T005 sequential;
  T006/T007 parallel to the schema chain; T008 depends on T003; T009 depends on T001; T011 depends
  on T002; T012 depends on T006, T008, T009, T011; T014 depends on T012; T015 depends on T008, T012,
  T014; T016 depends on T015; T017 depends on T008, T014, T015; T018 depends on T016, T017; T019
  depends on T008)
- **User Stories (Phase 3–5)**: All depend on Foundational completion; each story's `routes.ts` tasks
  are sequential (same file) but independent across stories in every other file
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no dependency on US2/US3
- **US2 (P2)**: Foundational only; adds endpoints to the same `routes.ts` file US1 started, so its
  route tasks (T041–T044) are sequenced after US1's (T024–T026), not parallel — but US2 remains
  independently testable once T041–T045 land
- **US3 (P3)**: Foundational only; extends the extractor/pipeline/service US1 built and the dialog
  US1 built, so its tasks are sequenced after the corresponding US1 tasks in each shared file

### Within Each User Story

- Tests are written first and should fail before the matching implementation task lands
- Backend (repository/extractor/pipeline already exist from Foundational) → route handlers → frontend
  API client → hooks → components → page wiring

### Parallel Opportunities

- T001 and T002 (Setup) in parallel
- T006/T007 (url-guard + its tests) in parallel with the T003→T005 schema/migration chain
- T010, T013 (unit tests) in parallel with their sibling implementation tasks once the corresponding
  module exists
- All test tasks within a story phase marked [P] run in parallel with each other
- T057/T058 (Polish) in parallel

---

## Parallel Example: User Story 1

```bash
# Tests for US1 (different files, independent):
Task: "Integration test: examine + create happy path in backend/tests/integration/downloads-examine-create.test.ts"
Task: "Integration test: direct-file URL skips examination in backend/tests/integration/downloads-direct-url.test.ts"
Task: "Integration test: no video found reports cleanly in backend/tests/integration/downloads-no-video.test.ts"
Task: "Integration test: unauthenticated access denied in backend/tests/integration/downloads-auth.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything — the largest phase, since the extraction/
   SSRF/pipeline/worker machinery all live here)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run T020–T023, confirm a pasted URL becomes a playable file
5. Demo: paste-URL-to-drive-file is already the complete point of the feature

### Incremental Delivery

1. Setup + Foundational → foundation ready (SSRF guard, extractor, pipeline, worker, DB table, all
   wired but no HTTP surface)
2. Add US1 → validate independently → demo the MVP
3. Add US2 → validate independently → demo progress/cancel/retry/durability
4. Add US3 → validate independently → demo multi-candidate/quality selection
5. Polish → E2E coverage + docs + full-suite regression check

---

## Notes

- [P] tasks touch different files and have no unmet dependency
- [Story] labels map every story-phase task to US1/US2/US3 for traceability
- Gating tests (isolation, SSRF, atomicity, caps/quota, auth) must pass before the feature is
  considered done — they encode the constitution's non-negotiables, not optional coverage
- `backend/src/modules/downloads/routes.ts` and `frontend/src/components/DownloadUrlDialog.tsx` are
  each touched by more than one story — those tasks are intentionally sequential, not [P]
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
