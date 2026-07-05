# Phase 0 Research: Download Videos from Web Pages to Drive

All decisions below extend the feature-001 stack (TypeScript · Fastify · SQLite/Drizzle · React)
into the video-download feature and resolve the spec's clarifications. There are no remaining
`NEEDS CLARIFICATION` items — the three clarified in `/speckit-clarify` (hybrid examination,
5-per-user concurrency, dual per-download caps) are turned into concrete mechanisms here, and
every other choice is grounded in the constitution (security-first, per-user isolation,
self-hosted ownership, media-first UI, reliability, simplicity).

---

## 1. Extraction & download engine

- **Decision**: Use the local **`yt-dlp`** binary (spawned, argument-array, never a shell string)
  as the primary engine to (a) **probe** a page/direct URL for video candidates and their formats
  and (b) **download** the chosen video, letting it reassemble HLS/DASH segments via the already
  required `ffmpeg`. `yt-dlp` is treated exactly like `ffmpeg` in feature-001: a local host tool,
  documented as a prerequisite, no SaaS, no telemetry.
- **Rationale**: `yt-dlp` is the de-facto, actively maintained tool covering direct files,
  embedded players, hundreds of hosting sites, and segmented streaming — the "Internet Download
  Manager" capability the owner asked for — while remaining fully self-hosted. Metadata probing
  (`--dump-single-json`) yields the title, duration, and per-format resolution/estimated size the
  spec needs for candidate display (FR-002, US3). It reuses `ffmpeg`, adding no new media stack.
- **Alternatives considered**: Building a bespoke extractor (rejected — enormous, brittle as sites
  change, duplicates a solved problem); a hosted extraction API (rejected — violates Principle III
  self-hosting/no-SaaS and would send the target URL off-box).
- **Security/ops notes**: pinned version documented in quickstart; spawned with an explicit
  argument array and a scratch working dir; wrapped by a timeout/size watchdog (see §5). If absent
  or failing a health check, the feature reports **unavailable** and the rest of FtDrive is
  unaffected (`DOWNLOADS_ENABLED`).

## 2. Hybrid examination — headless-browser fallback (FR-019)

- **Decision**: **Static-first, headless-fallback.** Try `yt-dlp` probing first. Only when it
  finds no video do we render the page in a **headless Chromium via Playwright** (already the
  project's E2E browser) in a locked-down context, capture the media/manifest URLs it requests
  (e.g. `.m3u8`/`.mpd`/video responses) via network interception, and hand the discovered URL back
  to `yt-dlp` (or the direct-fetch path for a plain file). The render runs under strict resource
  and wall-clock limits and within the examination timeout.
- **Rationale**: Directly implements the clarified hybrid strategy: keep the common case cheap,
  pay the heavy browser cost only when a page needs client-side JS to reveal the video. Reusing
  Playwright avoids introducing a second browser-automation stack.
- **Alternatives considered**: Always-headless (rejected in clarification — wasteful and larger
  attack surface on every download); Puppeteer (equivalent, but Playwright is already a project
  dependency); a JS-DOM/no-browser parser (insufficient — cannot execute the players that gate the
  media URL).
- **Security/ops notes**: the browser context runs with no stored credentials, an isolated
  profile/scratch dir, autoplay/download-to-disk disabled (we only sniff URLs), and per-render CPU/
  time caps. Discovered URLs are **still** passed through the SSRF guard (§4) before any byte is
  fetched. This is the feature's largest attack-surface addition and is tracked in the plan's
  Complexity Tracking with the recommended deploy-time egress sandbox.

## 3. Durable background jobs & worker pool (FR-005, FR-007, restart-survival)

- **Decision**: A **SQLite-backed job queue** — one new `downloads` table is the source of truth —
  driven by an **in-process worker pool**. Workers **claim** the oldest `queued` job for a user
  only while that user has fewer than **5** active jobs (the clarified per-user cap), transition it
  `examining → downloading → completed|failed`, and persist progress. The pool starts alongside the
  existing maintenance job in `services.ts`/app startup and stops on graceful shutdown. On
  **startup reconciliation**, any job left `examining`/`downloading` from a crash is reset to
  `queued` (bytes zeroed, its temp discarded) so it resumes from scratch — or to `failed`
  (retryable) if it has exhausted attempts.
- **Rationale**: Matches feature-001's architecture (single process, SQLite as the durable store,
  in-process `unref`'d timers) and satisfies both "survive user disconnect" (server-side execution)
  and "survive restart" (durable state + reconciliation) without a broker. Claiming in a
  transaction with an owner-active-count check enforces the 5-per-user limit and fair queueing.
- **Alternatives considered**: Redis + BullMQ or a separate queue service (rejected — a mandatory
  external service violates Principle III and the simplicity mandate at household scale); pure
  in-memory queue (rejected — loses all state on restart, fails FR-005 restart-survival);
  byte-level resumable downloads across restart (deferred — re-queue-from-scratch is simpler and
  still yields "it finished when I came back", with no partial file risk).

## 4. SSRF / URL safety guard (FR-013)

- **Decision**: A shared `lib/url-guard.ts` gates **every** outbound URL we control — the submitted
  URL and any media/manifest URL we resolve. It (1) allows only `http`/`https`; (2) resolves the
  host via DNS and **rejects** any address in loopback, private (RFC1918), link-local, unique-local,
  CGNAT, reserved/multicast ranges, or matching the server's own interface addresses; (3) follows
  redirects manually, re-validating the destination at **each hop** (defeating redirect-to-internal
  and basic DNS-rebinding by connecting to the validated IP). Blocked URLs return a generic "URL not
  allowed" error (no internal detail leaked).
- **Rationale**: The spec's non-negotiable that this feature "must never become a way to probe the
  owner's network." Centralizing the check keeps it a single, testable choke point.
- **Alternatives considered**: A static host denylist (rejected — misses IP-literal and DNS-rebind
  bypasses); trusting `yt-dlp`/browser to self-limit (insufficient — we guard the URLs we hand
  them and pre-validate the entry URL). **Residual risk**: `yt-dlp`'s own subsequent segment fetches
  are not individually intercepted; mitigated by validating the entry/host up front and by the
  recommended deploy-time network-namespace/egress filter (documented, not code).
- **Config**: `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES` (default `false`) exists only so an advanced
  self-hoster can *opt in* to LAN sources deliberately; off by default.

## 5. Per-download caps & per-user storage quota (FR-014, FR-020)

- **Decision**: Enforce **three** independent bounds, all config-driven:
  1. **Max wall-clock time** per download (`DOWNLOAD_MAX_DURATION_MS`, default 6 h) — a watchdog
     cancels a job that exceeds it (frees the worker slot).
  2. **Absolute per-file size ceiling** (`DOWNLOAD_MAX_BYTES`, default 20 GB) — checked against the
     known/declared size pre-flight and enforced mid-stream by counting bytes.
  3. **Per-user storage quota** (`USER_STORAGE_QUOTA_BYTES`, default `0` = unlimited) — computed as
     `SUM(size)` over the user's **live** file nodes; a download whose expected size would exceed
     remaining quota is refused pre-flight, and is stopped mid-stream if it grows past it.
  Breaching any bound stops the download, discards the temp (FR-010), records a clear retryable
  reason, and frees the slot.
- **Rationale**: Implements the clarified dual cap plus the storage-limit requirement. Feature-001
  has only a per-*file* upload limit; the per-user quota is the minimal new concept needed and is
  computed from existing node sizes (no counter to keep in sync).
- **Alternatives considered**: A maintained running-total column per user (rejected for now —
  redundant with `SUM(size)` at this scale and a consistency hazard); size cap only, no time cap
  (rejected in clarification).

## 6. Atomic finalize & integrity (FR-006, FR-010, FR-018)

- **Decision**: Reuse the **existing** storage path. The pipeline downloads to a per-user temp
  (`storage.writeStreamToTemp` for direct fetch; for `yt-dlp` we let it write to a scratch file then
  stream that into the temp), then on full success `storage.commitTemp` (fsync + atomic rename) and
  `nodes.insertFileNode(...)` create the node exactly as upload does. The destination folder is
  resolved with `resolveOwnedFolderOrThrow404`; the filename comes from the resolved title/source
  name via `sanitizeUploadName` + `resolveAvailableName` (keep-both suffixing — never overwrite,
  FR-018). Posters/playback via `media.ensureThumbnail`. On cancel/fail/restart the temp is
  discarded (existing sweeper collects any orphan).
- **Rationale**: The atomic temp→rename→commit invariant that makes uploads crash-safe (FR-010)
  is exactly what downloads need; reusing it means "a node appears only on full success" is already
  proven and tested. Name-collision and thumbnail behavior become identical to uploads for free.
- **Alternatives considered**: Writing straight to the final blob path (rejected — risks visible
  partial files); a separate finalize path (rejected — duplicates tested integrity code).

## 7. Default "Downloads" folder (FR-003)

- **Decision**: When the user picks no destination, ensure a top-level **"Downloads"** folder in
  their root (idempotent: create if missing, reuse if present) and target it. Explicitly chosen
  folders are resolved and ownership-checked like any node operation.
- **Rationale**: Matches the spec default and the "reachable without docs" UI principle; reuses
  node creation and the live-sibling uniqueness index.
- **Alternatives considered**: Forcing an explicit destination every time (rejected — extra step,
  worse SC-001); a hidden/system folder (rejected — the spec wants an ordinary, user-visible file).

## 8. Examine vs. download API shape (FR-002, FR-004, US1/US3)

- **Decision**: Two endpoints. `POST /downloads/examine { url }` runs a **bounded, synchronous**
  metadata probe (static, with headless fallback) and returns the detected candidates (title,
  duration, per-format quality/estimated size) or a "no video found" result — this powers the
  review/selection UI without creating a job. `POST /downloads { url, destinationFolderId?,
  formatId? }` **enqueues** a durable job; the worker re-resolves the chosen format at
  `examining` time (metadata/URLs can expire) and downloads it. A **direct video URL** skips
  examination in the worker (FR-004). Omitted `formatId` ⇒ best available quality of the primary
  video.
- **Rationale**: Separating a cheap, interactive **examine** from the durable **download** keeps
  SC-001 to ≤ 3 steps (paste → review → confirm) while making the actual transfer a background job
  that survives disconnect. Re-resolving at download time avoids acting on stale/expired media
  URLs.
- **Alternatives considered**: Single endpoint that examines-then-downloads inline (rejected —
  blocks the request, no review step, poor for US3); persisting candidates to reference later
  (rejected — extra state/expiry management; re-resolving is cheaper than the download anyway).

## 9. Progress delivery to the SPA (FR-007)

- **Decision**: **Polling** via TanStack Query. `GET /downloads` returns each job's state and
  progress (`bytesDownloaded`, `totalBytes` when known); the SPA polls on a short interval while any
  download is active and stops when none are. The worker persists progress **throttled** (e.g. at
  most every ~1 s / N%) to avoid write amplification. For `yt-dlp` downloads, progress is parsed
  from its `--newline --progress-template` stdout; for direct fetch, bytes are counted as they
  stream.
- **Rationale**: Consistent with feature-001's existing TanStack-Query data flow; no new transport
  (SSE/WebSocket) to secure or scale for a household-size instance.
- **Alternatives considered**: SSE/WebSocket push (rejected for now — added transport + auth surface
  for marginal benefit at this scale; can be added later behind the same endpoints).

## 10. Configuration & secrets (extends research §14 of feature-001)

- **Decision**: New env, validated fail-fast with the existing zod config loader:
  `DOWNLOADS_ENABLED` (default true), `YT_DLP_PATH` (default `yt-dlp`),
  `DOWNLOAD_MAX_CONCURRENCY_PER_USER` (default 5), `DOWNLOAD_MAX_BYTES` (default 20 GB),
  `DOWNLOAD_MAX_DURATION_MS` (default 6 h), `DOWNLOAD_EXAMINE_TIMEOUT_MS` (default 30 s),
  `USER_STORAGE_QUOTA_BYTES` (default 0 = unlimited), `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES`
  (default false). No secrets are added; the feature emits no credentials.
- **Rationale**: Same env-only, fail-fast posture as feature-001; every limit is tunable without
  code change (the spec calls the concurrency limit and caps "configurable defaults").

## 11. Testing strategy (gating)

- **Decision**: **Vitest** unit tests for `url-guard` (loopback/private/link-local/self/redirect
  rejection; public allowed), the `extractor` wrapper (candidate parsing + arg-array building, with
  the spawn mocked), and pipeline finalize/caps logic. **Vitest** API integration (Fastify `inject`)
  for the endpoints with external tools faked at the process boundary, including **gating negative
  tests**: (a) **isolation** — user A cannot list/get/cancel/retry/clear user B's download (→ uniform
  404); (b) **SSRF** — submitting loopback/private/self URLs is refused; (c) **atomicity** — a
  forced mid-download failure/cancel leaves **no node and no temp**; (d) **caps/quota** — over-size,
  over-time, and over-quota downloads are refused/stopped with a retryable reason; (e) **auth** —
  unauthenticated access denied. **Playwright** E2E covers paste→review→download→play on desktop and
  a 360 px mobile viewport using a **local fixture** page/video (no live third-party site in CI).
- **Rationale**: The constitution makes auth + isolation + integrity changes gating with negative
  tests; faking tools at the process boundary keeps tests hermetic and network-free.
- **Alternatives considered**: Hitting real external sites in CI (rejected — flaky, slow, and sends
  traffic off-box); skipping negative isolation/SSRF tests (rejected — these are the gating cases).

## 12. Observability (Security & Privacy Requirements)

- **Decision**: Structured `pino` logs for download lifecycle and security-relevant events — job
  created/started/completed/failed/cancelled, **SSRF refusals**, cap/quota stops, and tool
  spawn/exit codes — **excluding** file contents and any secrets. Logs stay local; no outbound
  telemetry. The submitted URL is logged (owner-visible operational data on the owner's own box);
  no third-party transmission.
- **Rationale**: Satisfies the constitution's auditability + privacy clauses and the "no phone-home
  by default" rule; the feature's only outbound connection is the user-requested content fetch.
- **Alternatives considered**: External log/telemetry sinks (rejected — would emit data off-box
  without opt-in).
