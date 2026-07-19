# Phase 0 Research: Download Movies from Embed-Based Streaming Sites

This feature extends `002-url-video-download`. The spec carried **zero** `NEEDS CLARIFICATION`
markers and the Technical Context has no unknowns — the stack (TypeScript · Fastify · SQLite ·
`yt-dlp` · Playwright/Chromium) is inherited unchanged. Phase 0 therefore consolidates the concrete
extraction/discovery decisions that turn the spec's requirements into an implementable design,
grounded in the current `modules/downloads/` code. Every decision is checked against the constitution
(security-first, per-user isolation, self-hosted, media-first, reliability, simplicity).

Findings are labelled **R1–R9** and cross-referenced from `plan.md`, `data-model.md`, and
`quickstart.md`.

---

## R1. Root-cause: why the current pipeline returns "no video found" for these sites

- **Verified against code** (`pipeline.ts`, `browser-probe.ts`, `extractor.ts`):
  1. `examine()` runs `yt-dlp --dump-single-json` on the movie page. For sites like
     `hdfilmcehennemi.nl` the page is an embed shell; yt-dlp's generic extractor finds no media, so
     the static path yields nothing.
  2. `BrowserProbe.discover()` navigates the top page with `waitUntil: 'networkidle'` and sniffs
     `page.on('response')` for media content-types/extensions. But the player only requests the
     `.m3u8` **after the user starts playback**, which never happens headlessly — `networkidle`
     fires first, so **nothing is discovered**.
  3. Even if a stream URL were sniffed, `discover()` returns **bare URL strings** — the request
     headers (Referer/Origin) are thrown away, so re-probing that URL with `yt-dlp` hits the host
     without the Referer it requires and gets **HTTP 403**.
  4. `run()` downloads from **`job.sourceUrl`** (the page) using a `formatId` that — on the headless
     path — was probed from a *different* discovered URL. So even when discovery works, the download
     targets the wrong URL. This is a latent feature-002 defect this feature must fix.
- **Decision**: The fix is not "a new site extractor" but four surgical changes: (a) trigger
  playback during discovery, (b) traverse embeds/frames and iterate alternative sources, (c) capture
  each stream's **request context** (headers), and (d) thread the resolved stream URL + headers
  through probe **and** download. R2–R6 detail each.
- **Alternatives considered**: Per-site scrapers keyed on domain (rejected — brittle, endless
  maintenance, and violates the spec's "class not one domain" FR-012); a hosted extraction API
  (rejected — Principle III, sends the target URL off-box).

## R2. Interactive, frame-aware discovery (FR-001, FR-002)

- **Decision**: Rework `BrowserProbe.discover()` so that, after load, it:
  1. Enumerates **embed/source candidates** = the `src` of every `<iframe>` on the page plus any
     inline `<video>`/player, collected in **DOM order** (this order is the site's own "alternative
     sources" list — see R4). Each candidate is url-guarded (R7).
  2. For each candidate in turn (bounded by `DOWNLOAD_MAX_SOURCES`, R8), **triggers playback**:
     dispatch `HTMLMediaElement.play()` in every reachable frame and synthesise a user click on the
     largest visible player element / iframe centre. Cross-origin iframes can't be scripted, but a
     coordinate click still reaches them.
  3. Waits up to `DOWNLOAD_PLAYBACK_WAIT_MS` for a media/manifest network request, matching the
     existing `MEDIA_EXTENSION_PATTERN` / `MEDIA_CONTENT_TYPES` (m3u8/mpd/mp4/webm + video
     content-types). `page.on('response')` already fires for **sub-frame** requests, so nested
     players are covered without special-casing each iframe.
  4. Records the first (and, within budget, any further) media request as a **resolved source**
     carrying `{ streamUrl, headers, sourceLabel }` (R3).
- **Rationale**: Directly implements "follow into embedded players, including nested" and "reveal
  streams that only appear after playback," reusing the Chromium sandbox already in the project. The
  network sniffer stays the single discovery mechanism; we only add *interaction* and *ordering*.
- **Alternatives considered**: Parsing/deobfuscating player JS ourselves (rejected — packers change
  constantly; executing the player in a real browser is the robust, generic method); always-on
  headless for every download (rejected — 002 already established static-first, headless-only-on-miss
  to keep the common case cheap and the attack surface small).
- **Security note**: Interaction happens inside the same locked-down, credential-less context (no
  `acceptDownloads`, isolated per job). Executing player JS already happened in 002 on load; adding
  a click/`play()` is a marginal increase, tracked in `plan.md` Complexity Tracking.

## R3. Capturing and threading the stream's request context (FR-004)

- **Decision**: A resolved source is `{ streamUrl: string; headers: StreamHeaders; sourceLabel:
  string | null }` where `StreamHeaders` captures the fields that make protected fetches succeed:
  `referer`, `origin`, `userAgent`, and `cookie` (optional). These come from
  `response.request().headers()` on the discovered media request (Playwright exposes the outgoing
  request headers). They are passed to `yt-dlp` for **both** probe and download via explicit argv:
  `--referer <referer>`, `--user-agent <ua>`, and repeatable `--add-header 'Origin: …'` /
  `--add-header 'Cookie: …'`. `download()` and `probe()` gain an optional `context` parameter; when
  present, the engine fetches the **`streamUrl`** (not `job.sourceUrl`) with those headers.
- **Rationale**: This is the single change that turns a 403 into a successful download and closes the
  R1(3)/R1(4) gap. Passing headers as discrete argv values keeps the no-shell-injection guarantee.
- **Security note**: The captured `cookie` (if any) is set by the sandbox's own isolated context for
  the target site only — it is never a user's FtDrive session and never crosses jobs (R7, Principle
  II). Headers are transient; nothing is persisted on the `downloads` row (R6).
- **Alternatives considered**: Relying on `yt-dlp`'s own referer inference (insufficient — it
  probes the page URL, not the sniffed cross-origin stream, and has no way to know the embed
  Referer); persisting headers on the job row (rejected — unnecessary since `run()` re-resolves
  fresh, and it would store site cookies at rest for no benefit).

## R4. Automatic multi-source fallback (FR-003, US2)

- **Decision**: `examine()` returns the **ordered list of resolved sources** (R2/R3), not just the
  first. `run()` iterates them: for each source, resolve the chosen/best format (R5) and
  `downloadToScratch` from that source's `streamUrl`+headers; on failure, discard the scratch temp
  and try the next source; on success, finalize atomically. Only when every source is exhausted does
  it `markFailed('ALL_SOURCES_FAILED', …)`. The user takes no extra action (SC-003). The whole loop
  stays inside the existing per-download time cap (R8) so a page full of dead sources can't run
  forever.
- **Rationale**: These pages routinely list several mirror servers where the first is dead; single-
  source behaviour would feel broken even when the movie is downloadable. Trying mirrors
  automatically is exactly the user's mental model ("I want the movie, not a specific server").
- **Alternatives considered**: Ask the user to pick a server (rejected — they don't care which
  mirror; picking *quality* is still offered in R5); a bulk parallel attempt of all sources
  (rejected — wasteful of worker slots and bandwidth, and complicates the single-temp atomic
  finalize; sequential with early-exit is simpler and sufficient at household scale).

## R5. Quality selection over a resolved source (FR-007, US3)

- **Decision**: Reuse the existing `probe → candidates → formats` shape and `resolveSelection` /
  `bestFormat`. After a source is resolved (R2), `yt-dlp` probes its `streamUrl` **with context**
  (R3) to enumerate qualities; the transient `DetectedVideoCandidate[]` returned by
  `POST /downloads/examine` is unchanged, so the existing `CandidatePicker` renders qualities with
  no frontend change. Default is highest quality; a single quality proceeds without asking.
- **Rationale**: HLS renditions map cleanly onto the existing format list; no new UI or contract.
- **Note (tolerant selection)**: `formatId`s are ephemeral per probe. Because `run()` re-resolves
  sources fresh and may land on a different (working) source than examine did, the chosen `formatId`
  might not exist at run time. `resolveSelection` already falls back to the best available format in
  that case — the intended, documented behaviour (no error, just best quality on the working
  source).

## R6. No schema change; discovery output is transient

- **Decision**: The `downloads` table (feature 002) is reused **unchanged** — no columns, no
  migration. Resolved sources and their headers live only in memory during `examine()`/`run()`.
  `sourceUrl` stays the user-submitted page; `selection` stays the chosen `formatId`; `title` is the
  movie title discovered during probe; failures use `error_code`/`error_message`.
- **Rationale**: `run()` already re-resolves everything fresh at execution time ("metadata/URLs can
  expire"), so persisting resolved streams would add an at-rest cookie/token store for zero benefit
  and a consistency hazard. Keeping the schema fixed honours the simplicity and data-safety mandates
  (no migration risk).
- **Alternatives considered**: A `download_sources` child table (rejected — unused across restarts
  since we re-resolve; pure overhead).

## R7. SSRF safety across embeds and streams (FR-010, Principle I/II)

- **Decision**: The shared `lib/url-guard` gates **every** URL this feature introduces: the
  submitted page (already), **each embed/iframe candidate host** before it is loaded, and **each
  resolved stream URL** before it is handed to `yt-dlp` — reusing the existing per-hop, DNS-pinned
  `assertUrlAllowed`. A candidate/stream that resolves to loopback/private/link-local/self is
  dropped silently (no internal detail leaked), and if that removes every source the page reports
  `NO_VIDEO_FOUND` / `ALL_SOURCES_FAILED`. The sandbox context is created fresh per job with no
  stored credentials, so no cookie/token crosses jobs or users.
- **Rationale**: Following embeds multiplies the URLs we fetch; each must pass the same choke point
  or embed-following becomes an SSRF vector. This is the non-negotiable from the spec ("must never
  become a way to reach the owner's internal network").
- **Residual risk (carried forward, unchanged from 002)**: `yt-dlp`'s own HLS **segment** fetches
  are not individually guarded. Mitigated by guarding the entry page, every embed host, and the
  resolved playlist URL up front, plus the documented deploy-time network-namespace/egress filter.
  Tracked in `plan.md` Complexity Tracking.

## R8. New configuration knobs (env-only, safe defaults)

- **Decision**: Add, alongside the existing `DOWNLOAD_*` env vars (Zod-validated, fail-fast):
  - `DOWNLOAD_MAX_SOURCES` (default `5`) — cap on alternative sources examined/attempted per movie;
    bounds both examine and the `run()` fallback loop.
  - `DOWNLOAD_PLAYBACK_WAIT_MS` (default `8000`) — how long to wait for a media request after
    triggering playback on one source, before moving to the next.
  - `DOWNLOAD_EXAMINE_TIMEOUT_MS` — **existing** (default `30000`); may be raised to accommodate
    interactive discovery of the first working source. The overall examine still hard-stops at this
    timeout via the existing `Promise.race` in `service.examineUrl`.
- **Rationale**: All three keep worst-case time bounded so a page of dead/slow sources can't exhaust
  a worker slot; env-only + safe defaults matches feature 002's configuration posture and the
  self-hoster's ability to tune without code changes.
- **Alternatives considered**: Hard-coded constants (rejected — the constitution and 002 precedent
  require these bounds to be tunable defaults).

## R9. Failure taxonomy (FR-008)

- **Decision**: Map outcomes to distinct `error_code`s so the user sees a specific reason:
  - `NO_VIDEO_FOUND` — no embed/source yielded any stream.
  - `ALL_SOURCES_FAILED` — **new** — one or more sources were found but none downloaded.
  - `SOURCE_INACCESSIBLE` — login/paywall/geo-block; extend `extractor.ts` `INACCESSIBLE_PATTERNS`
    with geo phrases (e.g. "not available in your country", "geo") so region locks are reported, not
    silently treated as "no video." (Kept as one code with a clear message; the spec asks these be
    *distinguished from the others*, which this satisfies.)
  - `DRM_PROTECTED` — copy-protected; reported, never bypassed (unchanged).
  - Plus existing `SIZE_LIMIT` / `TIME_LIMIT` / `SOURCE_UNAVAILABLE` / `INTERRUPTED`.
- **Rationale**: Satisfies "never a silent or generic failure" and gives the frontend meaningful
  text via the existing `errorMessage` field with no UI change.
- **Note**: We do **not** add geo-bypass/`--geo-bypass` — the spec requires reporting geo-blocks,
  not circumventing them, consistent with the DRM stance.

---

## Summary of decisions

| # | Decision | Requirement(s) |
|---|----------|----------------|
| R1 | Fix discovery + threading, not per-site scrapers | FR-001, FR-012 |
| R2 | Interactive, frame-aware, ordered embed discovery | FR-001, FR-002 |
| R3 | Capture stream request headers; pass to yt-dlp probe + download | FR-004 |
| R4 | Ordered multi-source fallback loop in `run()`; `ALL_SOURCES_FAILED` | FR-003, US2 |
| R5 | Reuse candidate/format shape for quality; tolerant selection | FR-007, US3 |
| R6 | No schema change; discovery output transient | data integrity, simplicity |
| R7 | url-guard every embed + stream; isolated per-job context | FR-010, Principle I/II |
| R8 | 3 env knobs bound sources/playback/examine time | FR-011 caps |
| R9 | Distinct error codes incl. new `ALL_SOURCES_FAILED`, geo reported | FR-008, FR-009 |
