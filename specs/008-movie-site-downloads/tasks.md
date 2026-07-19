---
description: "Task list for feature 008 — movie-site (embed-based) downloads"
---

# Tasks: Download Movies from Embed-Based Streaming Sites

**Input**: Design documents from `/specs/008-movie-site-downloads/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R9), data-model.md, contracts/api-delta.md

**Tests**: Included — the plan and quickstart explicitly call for new integration tests. They use
the existing `Extractor` / `BrowserProbeLike` injection seams (offline, deterministic).

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3), after shared Setup + Foundational work.

## Path Conventions

Web app: backend at `backend/src/`, tests at `backend/tests/integration/`. This feature is
backend-only inside `modules/downloads/` + `config/`; the frontend is reused unchanged.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add env knobs `DOWNLOAD_MAX_SOURCES` (default 5) and `DOWNLOAD_PLAYBACK_WAIT_MS` (default 8000) to `backend/src/config/index.ts` — extend `EnvSchema`, the `AppConfig` interface, and the `loadConfig` return (research R8).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Both stories' discovery/download depend on these shared shapes and the header-aware engine.**

- [x] T002 [P] Define transient discovery shapes `StreamHeaders` and `ResolvedSource`, and change `BrowserProbeResult` to `{ sources: ResolvedSource[] }` plus the `BrowserProbeLike.discover(...)` signature in `backend/src/modules/downloads/browser-probe.ts` (data-model.md; research R3/R4).
- [x] T003 Make the extractor request-context aware in `backend/src/modules/downloads/extractor.ts`: `buildProbeArgs`/`buildDownloadArgs` accept an optional `StreamHeaders` and emit `--referer` / `--user-agent` / repeatable `--add-header` argv; `probe()` and `download()` accept an optional `context` param (research R3). Argument-array only — no shell string.

**Checkpoint**: Foundation ready — user story work can begin.

---

## Phase 3: User Story 1 — Download a movie whose player is embedded (Priority: P1) 🎯 MVP

**Goal**: Paste a movie page whose video plays only in a third-party embedded player; FtDrive
follows into the embed, resolves the real stream with its request context, downloads and reassembles
it, and saves a playable, correctly-named file.

**Independent test**: A page with no direct media but one embedded player yields a completed node;
a stream that 403s without context succeeds once the captured Referer/headers are passed.

- [x] T004 [P] [US1] Integration test `backend/tests/integration/downloads-embed-source.test.ts`: page with no static media + a faked embed source → job reaches `completed` with a node; a page with no embed → `NO_VIDEO_FOUND`.
- [x] T005 [P] [US1] Integration test `backend/tests/integration/downloads-stream-headers.test.ts`: assert the faked extractor's `download()`/`probe()` receive the captured `StreamHeaders` (referer/UA/add-header), and that a context-less attempt (simulated 403) succeeds only with context.
- [x] T006 [US1] Implement interactive, frame-aware discovery in `backend/src/modules/downloads/browser-probe.ts`: enumerate iframe `src`s + inline players in DOM order, trigger playback (`HTMLMediaElement.play()` in each frame + a coordinate click on the largest player/iframe), wait up to `playbackWaitMs` for a media/manifest request, capture `{ streamUrl, headers, sourceLabel }` from `response.request().headers()`, url-guard each `streamUrl`, and return ordered `ResolvedSource[]` (research R2/R7).
- [x] T007 [US1] Update `backend/src/modules/downloads/pipeline.ts` `examine()` to return an internal `ExamineResult { …ProbeResult, targets: DownloadTarget[] }`: static/native path → `targets=[{ url }]`; browser path → one target per resolved source (`{ url: streamUrl, headers }`), and populate display `candidates` by context-probing the first working source (synthesize a single `best` candidate if formats can't be enumerated within budget, so a discovered stream still lets the user proceed — research R2, contracts behavioural note).
- [x] T008 [US1] Update `pipeline.ts` `run()` + `downloadToScratch()` to download from the selected **target's** `url` with its `StreamHeaders` (not `job.sourceUrl`) and finalize atomically; preserve the direct-file/native path (target = page URL, no headers). This closes the feature-002 latent gap (research R1).
- [x] T009 [US1] Confirm `backend/src/modules/downloads/service.ts` `examineUrl()` maps the internal `ExamineResult` down to the wire `ProbeResult` (drops `targets`) and that `checkCapsPreflight` still works; no route/DTO change in `routes.ts`.

**Checkpoint**: US1 independently downloadable — a single-embed movie page works end-to-end.

---

## Phase 4: User Story 2 — Automatic fallback across alternative sources (Priority: P2)

**Goal**: When a movie page lists several sources/mirrors, try them in order until one downloads;
report `ALL_SOURCES_FAILED` only when every source is exhausted — with zero extra user action.

**Independent test**: First source fails at download → a later source completes; every source fails
→ job `failed` with `ALL_SOURCES_FAILED` and no partial file.

- [x] T010 [P] [US2] Integration test `backend/tests/integration/downloads-source-fallback.test.ts`: faked discovery returns 3 sources; first download throws, second succeeds → node created; all three throw → `failed` + `errorCode='ALL_SOURCES_FAILED'`, no node, temp discarded.
- [x] T011 [US2] In `browser-probe.ts`, collect up to `maxSources` ordered candidates (not just the first) — enumerate all embeds and de-duplicate stream URLs; bound by `DOWNLOAD_MAX_SOURCES` (research R4/R8).
- [x] T012 [US2] In `pipeline.ts` `run()`, iterate `targets` in order: probe (with context) → resolve format → `downloadToScratch`; on any failure discard the scratch temp and continue; on success finalize and stop. After the loop, `markFailed('ALL_SOURCES_FAILED', …)` when targets existed, else keep `NO_VIDEO_FOUND` (research R4/R9).
- [x] T013 [US2] Add the `ALL_SOURCES_FAILED` human-readable message in `pipeline.ts`; confirm the DTO surfaces `errorCode`/`errorMessage` unchanged and `contracts/api-delta.md` matches.

**Checkpoint**: US2 layered on US1 — multi-mirror pages are reliable.

---

## Phase 5: User Story 3 — Choose quality when a source offers several (Priority: P3)

**Goal**: Present the resolved source's qualities (HLS renditions) and let the user pick; default to
best; single-quality proceeds silently. Selection is tolerant when a `formatId` expires.

**Independent test**: A source exposing 1080p/720p lists both; picking 720p downloads 720p; no pick
→ best; a stale `formatId` falls back to best without error.

- [x] T014 [P] [US3] Integration test `backend/tests/integration/downloads-embed-quality.test.ts`: multi-rendition source lists formats; explicit `formatId` honored; a `formatId` absent from the run-time source falls back to `bestFormat` (research R5).
- [x] T015 [US3] Verify/adjust `extractor.ts` format mapping so HLS renditions surface as `formats` (height/quality labels), and that `resolveSelection`/`bestFormat` in `pipeline.ts` remain tolerant across per-source re-probing (research R5). No frontend change — existing `CandidatePicker` renders formats.
- [ ] T016 [US3] (Additive, optional — **deferred**) surface an optional `sourceLabel` on examine candidates via `service.ts`. Deferred deliberately: the examine wire shape is kept to exactly `{ videoFound, directFile, candidates }` (pinned by `downloads-no-video` and asserted in `downloads-embed-source`); the label is captured internally on `ResolvedSource` and the frontend ignores it, so exposing it adds cross-layer plumbing for no user-visible gain. Revisit if a future UI shows the mirror.

**Checkpoint**: All three stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T017 [P] Extend `INACCESSIBLE_PATTERNS` in `backend/src/modules/downloads/extractor.ts` with geo phrases (e.g. "not available in your country", "geo restricted") so region locks report `SOURCE_INACCESSIBLE`, not `NO_VIDEO_FOUND`; do **not** add geo-bypass (research R9).
- [x] T018 [P] Integration test `backend/tests/integration/downloads-geo-inaccessible.test.ts`: a geo/login failure ends `failed` with a specific inaccessible reason (not silent, not `NO_VIDEO_FOUND`).
- [x] T019 [P] SSRF/isolation coverage for embed-following (research R7; Principle I/II). Implemented as a dedicated new file `backend/tests/integration/downloads-embed-ssrf.test.ts` (a discovered internal `streamUrl` is dropped by the pipeline's `url-guard` re-check and never fetched) rather than editing `isolation-downloads.test.ts`; the existing `isolation-downloads` suite still passes unchanged, confirming cross-user 404 isolation holds with embed-following.
- [x] T020 Ran `npm --workspace backend run typecheck` (clean), `npm --workspace backend run build` (success), and the full `npm --workspace backend test` (188 passed). `.env.example` update skipped — the file is outside this session's writable paths; both new knobs have safe defaults so the app runs without them.

---

## Implementation status (executed via `/speckit-implement`)

All tasks complete except **T016** (optional additive `sourceLabel`, deliberately deferred — see note above). Gates: backend typecheck ✅, backend build ✅, backend tests **188 passed** (14 new), frontend typecheck ✅. No new dependency, no migration, no route/DTO change. Changes live in `backend/src/modules/downloads/{browser-probe,extractor,pipeline,service}.ts`, `backend/src/config/index.ts`, the test fixtures, and six new integration test files. Work is on branch `feat/008-movie-site-downloads` (not committed — awaiting your review).

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T003)** must complete before any story.
- **US1 (T004–T009)** is the MVP and unblocks US2/US3.
- **US2 (T010–T013)** depends on US1's discovery/target model (T006–T008).
- **US3 (T014–T016)** depends on US1's context-probe (T007) producing formats.
- **Polish (T017–T020)** last; T020 is the final gate.

## Parallel Opportunities

- T002 ∥ (then T003 depends on the shapes).
- Within US1: T004 ∥ T005 (distinct test files) before/alongside T006–T008.
- Cross-cutting tests T017 ∥ T018 ∥ T019 (distinct files).

## MVP Scope

**User Story 1 only (T001–T009)**: a movie page with an embedded player downloads end-to-end with
correct request context — the core of the user's request. US2 (reliability across mirrors) and US3
(quality choice) are incremental.
