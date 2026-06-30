# Phase 0 Research: FtDrive — Personal Cloud Drive Web Application

All decisions resolve the spec + constitution into a concrete stack. There are no remaining
`NEEDS CLARIFICATION` items: the user fixed Node.js + TypeScript + responsive UI; everything else
is chosen here with rationale grounded in the constitution's principles (security-first,
per-user isolation, self-hosted ownership, media-first UI, reliability, and simplicity).

---

## 1. Runtime & language

- **Decision**: TypeScript 5.x on Node.js 22 LTS (ESM).
- **Rationale**: User-mandated. Node 22 is the current LTS (long support window for a self-hosted
  box); TypeScript gives compile-time guarantees that help enforce ownership-typed APIs.
- **Alternatives considered**: Deno/Bun (less ubiquitous for self-hosters, smaller ecosystem for
  `sharp`/native bindings); plain JavaScript (rejected — loses type safety the user asked for).

## 2. Backend HTTP framework

- **Decision**: Fastify.
- **Rationale**: First-class TypeScript, built-in JSON-schema validation (directly supports the
  constitution's input-validation requirement), excellent streaming for large
  uploads/downloads + HTTP range (video), low overhead, mature plugins (`@fastify/multipart`,
  `@fastify/static`, `@fastify/rate-limit`, `@fastify/cookie`). A global `preHandler` makes
  "default deny" auth a single enforced choke point.
- **Alternatives considered**: Express (ubiquitous but no built-in validation, weaker typing,
  streaming/range needs more glue); NestJS (powerful but heavier/more ceremony than a
  single-owner app warrants — conflicts with the simplicity principle).

## 3. Frontend framework & build

- **Decision**: React 18 + Vite + TypeScript, with TanStack Query for server state and React
  Router for navigation. Mobile-first responsive CSS.
- **Rationale**: Large ecosystem for media components (galleries, video), Vite gives fast dev +
  small static production build that the backend serves directly. TanStack Query handles
  pagination, caching, and loading/error states (Principle IV) cleanly. Responsive behavior is
  validated at 360 px (SC-005) via Playwright mobile viewports.
- **Alternatives considered**: SvelteKit/Vue (fine technically; React chosen for ecosystem
  breadth and contributor familiarity); Next.js (SSR/meta-framework adds deployment complexity
  not needed for an authenticated self-hosted SPA).

## 4. Metadata storage (database)

- **Decision**: SQLite (single file) via Drizzle ORM with the `better-sqlite3` driver; WAL mode.
- **Decision status**: Confirmed by the owner on 2026-06-29 — SQLite chosen over PostgreSQL. The
  data-access layer stays DB-portable via Drizzle, so migrating to PostgreSQL later is a contained
  change if concurrency/multi-node needs emerge.
- **Rationale**: Zero extra service to run/secure on a single self-hosted box (Principle III +
  simplicity); trivial backup (copy the file); fully transactional for safe moves/trash. Drizzle
  is TypeScript-first with explicit, data-preserving migrations. WAL improves concurrent reads
  for browsing while a write proceeds.
- **Alternatives considered**: PostgreSQL (operationally heavier; unnecessary at this scale);
  Prisma (heavier runtime + engine binary vs. Drizzle's thin layer); filesystem-only metadata
  (rejected — makes isolation queries, search, trash retention, and atomic renames fragile).

## 5. File-content storage layout

- **Decision**: Owner's local filesystem under a configured `DATA_ROOT`, isolated per user:
  `DATA_ROOT/users/<userId>/blobs/...`; derived thumbnails cached at
  `DATA_ROOT/users/<userId>/thumbs/...`. The DB stores the logical tree; physical blob names are
  opaque (e.g., content/uuid-based) so user-chosen names never reach the raw path.
- **Rationale**: Per-user directory roots satisfy "storage layout MUST keep each user's files
  separated" (Principle II). Opaque physical names + server-side path resolution confined to the
  user root prevents traversal (Principle I). Keeping bytes on disk (not in the DB) keeps the DB
  small and backups straightforward.
- **Alternatives considered**: BLOBs in SQLite (bloats DB, poor for multi-GB video/range
  streaming); user-name-derived paths (rejected — invites traversal and collisions).

## 6. Authentication & session strategy

- **Decision**: Username + password login; **Argon2id** hashing (`argon2` package). **Server-side
  sessions** stored in SQLite (random opaque session id), referenced by a signed, `HttpOnly`,
  `Secure`, `SameSite=Lax` cookie via `@fastify/cookie`. Sessions have `expires_at` and a
  `revoked_at` for logout/admin revocation.
- **Rationale**: Constitution mandates slow one-way hashing, expiring + revocable sessions, and
  secure cookies. Server-side sessions make revocation immediate and simple (a JWT cannot be
  revoked without extra infrastructure). Argon2id is the constitution's named preference.
- **Alternatives considered**: JWT access tokens (revocation/rotation complexity, larger attack
  surface for a feature that needs instant revoke); bcrypt (acceptable per constitution, but
  Argon2id is preferred and memory-hard).

## 7. Brute-force / failed-login defense (FR-020)

- **Decision**: Progressive throttling + rate limiting on the login route, keyed by **both**
  account (username) and source IP, using `@fastify/rate-limit` plus a persisted
  `login_throttle` record for cross-restart back-off. No permanent lockout. Responses for
  wrong-password vs. unknown-user are identical (uniform timing + message) to avoid account
  enumeration.
- **Rationale**: Directly implements the Q2 clarification and Principle I without the self-DoS
  risk of hard lockouts. Persisting the counter prevents a restart from resetting an attacker's
  back-off.
- **Alternatives considered**: Temporary account lockout (rejected in clarification — enables
  attacker-driven denial of a legitimate account); CAPTCHA (adds a third-party/JS dependency,
  overkill for a small self-hosted user base).

## 8. Image thumbnails

- **Decision**: `sharp` (libvips) to generate and cache fixed-size thumbnails + a larger preview
  variant on first request (or on upload for small images), stored under the per-user `thumbs`
  dir. Thumbnail requests pass the same ownership authorization as content.
- **Rationale**: sharp is the fastest, lowest-memory option and handles EXIF orientation. Caching
  derived images keeps folder views fast (SC-006). Authorizing thumbnails prevents the
  constitution's "no leak via thumbnails" rule from being violated.
- **Alternatives considered**: Jimp (pure-JS, much slower/memory-heavy); on-the-fly without cache
  (re-encoding per view fails the 2 s large-folder target).

## 9. Video thumbnails (poster frames) & playback

- **Decision**: Extract a poster frame with the local **`ffmpeg`** binary (spawned, not bundled)
  at upload-time or first request, cached like image thumbs. Playback streams the original file
  with HTTP **range** support (`Accept-Ranges`/`Content-Range`) so the browser `<video>` element
  seeks without downloading the whole file.
- **Rationale**: ffmpeg is the de-facto local tool for frame extraction; range streaming is the
  standard, dependency-light way to serve large video and meets "media-first" + reliability
  goals. ffmpeg is local tooling, not a SaaS (Principle III).
- **Alternatives considered**: On-the-fly transcoding/HLS packaging (heavy CPU, complex — deferred
  unless format compatibility proves insufficient); embedding a JS video decoder (unnecessary).
- **Note / dependency**: `ffmpeg` must be installed on the host (documented in quickstart). If
  absent, video uploads still store/stream; only poster generation degrades gracefully to a
  generic icon (`thumb_status = unsupported`).

## 10. Uploads & crash-safe writes (FR-014)

- **Decision**: `@fastify/multipart` streams the upload to a temp file in a per-user `tmp` dir;
  on completion the file is `fsync`'d and **atomically renamed** into its final blob path, then
  the DB row is committed. Interrupted uploads leave only an orphaned temp file, which a sweep
  removes; no partial/corrupt blob ever becomes visible. Per-file size limit enforced from config
  (default 5 GB). **Discard-and-restart** (no resumable protocol) per the Q4 clarification.
- **Rationale**: Atomic temp→rename + commit-after-bytes guarantees integrity (Principle V); the
  simplest approach that satisfies the clarified requirement.
- **Alternatives considered**: Resumable/chunked uploads (tus) — explicitly deferred (out of
  scope); writing directly to the final path (rejected — risks visible partial files).

## 11. Name collisions, move safety, search

- **Decision**: Uniqueness enforced by a partial unique index `(owner_id, parent_id, name)` over
  non-trashed nodes; on collision the system **keeps both** by suffixing (" (2)", " (3)", …).
  Moves validate that the destination is an owned folder and reject cycles (cannot move a folder
  into its own descendant). **Search** is a `owner_id`-scoped, indexed `name LIKE` query (substring,
  case-insensitive) — no full-text engine.
- **Rationale**: Implements FR-013 (no silent overwrite, no versioning), FR-006 move semantics,
  and FR-021 (name search, isolation-respecting) with minimal machinery.
- **Alternatives considered**: SQLite FTS5 (overkill for name-only search); overwrite-on-collision
  (rejected by spec).

## 12. Pagination for large libraries (SC-006)

- **Decision**: **Keyset (cursor) pagination** ordered by `(type DESC, name ASC, id)` returning an
  opaque `nextCursor`; the frontend lazy-loads thumbnails via `IntersectionObserver`.
- **Rationale**: Keyset pagination stays O(limit) regardless of folder size (offset pagination
  degrades on deep pages); lazy thumbnails keep first-paint fast.
- **Alternatives considered**: Offset/limit (slow deep in 100k-item folders); load-all (fails the
  2 s target).

## 13. TLS & deployment model

- **Decision**: The app listens on HTTP locally; **TLS is terminated by a reverse proxy**
  (recommended: Caddy for automatic certificates) or reached over a VPN. The app trusts proxy
  `X-Forwarded-*` only when `TRUST_PROXY` is enabled and sets `Secure` cookies in production.
- **Rationale**: Matches the constitution's deployment guidance (hardened reverse proxy/VPN, never
  a raw open port) and keeps cert management out of the app (simplicity). 
- **Alternatives considered**: Native Node HTTPS with manual certs (more app-level cert handling);
  exposing plain HTTP (forbidden by constitution).

## 14. Configuration & secrets

- **Decision**: All config via environment (validated with zod at startup): `DATA_ROOT`,
  `DATABASE_PATH`, `SESSION_SECRET`, `TRUST_PROXY`, `MAX_UPLOAD_BYTES`, `TRASH_RETENTION_DAYS`
  (default 30), `OWNER_BOOTSTRAP_*`. The first owner account is created via a one-time CLI/seed
  command, not a public signup (matches "owner-provisioned, no self-registration").
- **Rationale**: Constitution requires secrets from env, never committed; startup validation fails
  fast on misconfiguration.
- **Alternatives considered**: Config file with secrets (acceptable but env is the constitution's
  stated mechanism); public registration (rejected by spec assumptions).

## 15. Testing strategy (gating)

- **Decision**: **Vitest** for backend unit tests and API integration tests (Fastify `inject`),
  including **per-user isolation negative tests** (user A cannot list/read/download/move/delete or
  search user B's data, by id-guessing → uniform 404) and auth tests (anonymous denied, session
  expiry/revocation, login throttling). **Playwright** for E2E across a desktop and a 360 px
  mobile viewport covering the four user stories. Frontend component units in Vitest.
- **Rationale**: The constitution makes auth + isolation changes gating with negative tests;
  Vitest pairs with Vite/TS, Playwright validates the responsive media UX that is core to the
  product.
- **Alternatives considered**: Jest (slower with ESM/TS than Vitest); Cypress (Playwright has
  better multi-viewport + headless CI ergonomics).

## 16. Observability & audit (Security & Privacy Requirements)

- **Decision**: Structured logging (Fastify/`pino`) of auth events (login success/failure,
  permission denials, session revocation) and security-relevant actions, **excluding** secrets,
  credentials, and file contents. Logs stay local; no outbound telemetry.
- **Rationale**: Satisfies the constitution's auditability + privacy clauses while honoring "no
  phone-home by default."
- **Alternatives considered**: External log/telemetry services (rejected — would emit data off-box
  without opt-in).
