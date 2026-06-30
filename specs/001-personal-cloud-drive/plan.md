# Implementation Plan: FtDrive — Personal Cloud Drive Web Application

**Branch**: `001-personal-cloud-drive` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-personal-cloud-drive/spec.md`

## Summary

FtDrive is a self-hosted, Google Drive–like personal cloud: authenticated users browse a private
folder/file hierarchy, preview photos and play videos with thumbnails, upload/download files
(including from a phone), and organize their library (create/rename/move/delete with recoverable
trash and name search) — with strict, server-enforced per-user isolation.

**Technical approach**: A single self-hosted, full-stack TypeScript application. A **Fastify**
(Node.js) HTTP API enforces authentication, per-user authorization, input/path validation, and
media streaming; metadata lives in a local **SQLite** database (via Drizzle ORM) while file bytes
live on the owner's local filesystem under per-user roots. A **React + Vite** responsive SPA
(served as static assets by the backend in production) delivers the media-first, phone-friendly
UI. Thumbnails/posters are generated with **sharp** (images) and **ffmpeg** (video); video is
streamed via HTTP range requests. TLS is terminated by a reverse proxy (e.g., Caddy) per the
self-hosted deployment model. No third-party cloud or telemetry is required.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**:
- Backend: Fastify (HTTP), `@fastify/multipart` (uploads), `@fastify/static` (serve SPA),
  `@fastify/rate-limit` (login throttling), Drizzle ORM + `better-sqlite3` (metadata),
  `argon2` (password hashing), `zod`/Fastify JSON schema (input validation), `sharp` (image
  thumbnails)
- System binary: `ffmpeg` (video poster/thumbnail extraction) — local tool, no SaaS
- Frontend: React 18 + Vite, TypeScript, TanStack Query (data fetching/caching), React Router

**Storage**:
- Metadata: SQLite database file on local disk (users, sessions, nodes, trash, login throttle)
- File content: owner-controlled local filesystem, isolated per-user roots
  (`<DATA_ROOT>/users/<userId>/...`); derived thumbnails cached per-user

**Testing**: Vitest (backend unit + API integration via Fastify `inject`, incl. per-user
isolation negative tests; frontend component units) and Playwright (E2E across desktop + mobile
viewports for the primary user journeys)

**Target Platform**: Single self-hosted Linux server (runs as a non-root service user); web UI
on modern desktop and mobile browsers

**Project Type**: Web application (separate `backend/` API + `frontend/` SPA; backend serves the
built SPA in production for a single deployable)

**Performance Goals**:
- Folder view with 1,000+ items shows first content < 2 s and scrolls smoothly via keyset
  pagination + lazy-loaded thumbnails (SC-006)
- Typical phone photo upload visible with thumbnail < 10 s on a home network (SC-004)
- Locate + open a specific photo/video < 30 s on a phone (SC-003, aided by name search)

**Constraints**:
- Every data path authenticated; default deny (Principle I)
- Per-user isolation enforced at the data-access layer (queries filtered by `owner_id`) **and**
  re-checked before returning content/metadata; cross-user access returns a uniform 404
  (Principle II)
- Atomic, crash-safe writes: uploads stream to a temp file, fsync, then atomic rename; interrupted
  uploads are discarded, never leaving partial/corrupt files (FR-014)
- Secrets (session signing key, DB path, admin bootstrap) from environment/config only
- TLS required in production (reverse proxy); session cookies `HttpOnly` + `Secure` + `SameSite`
- Runs on modest single-machine hardware; no mandatory external services

**Scale/Scope**: Single instance for a household/small group — on the order of tens of users,
libraries up to ~100k files per user, individual files up to several GB (configurable per-file
limit, default 5 GB). Low concurrency (tens of simultaneous sessions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Initial evaluation (and post-design re-check, see end of Phase 1): **PASS** — no violations,
Complexity Tracking empty.

| Principle | How this plan complies |
|-----------|------------------------|
| **I. Security & Authentication First** (NON-NEGOTIABLE) | Global auth `preHandler` guard (default deny); Argon2id password hashing; server-side sessions that expire + are revocable, referenced by `HttpOnly`/`Secure`/`SameSite` signed cookies; secrets from env; Fastify schema validation on every input; filesystem path resolution confined to the user root (path-traversal safe); failed-login rate-limiting/throttling (FR-020). |
| **II. Strict Per-User Data Isolation** (NON-NEGOTIABLE) | All metadata queries filtered by `owner_id` at the data-access layer and re-checked before returning; opaque IDs; uniform 404 for non-owned/non-existent (no existence disclosure via IDs, counts, errors, or timing); thumbnails/content served only after ownership check; per-user filesystem roots; isolation proven with negative integration tests (gating). |
| **III. Self-Hosted Data Ownership** | Local filesystem for bytes + local SQLite for metadata; no third-party cloud dependency; `ffmpeg`/`sharp` are local tools; no telemetry/outbound by default; backup = copy data dir + SQLite file with local tooling. |
| **IV. Media-First, Intuitive UI** | Folder hierarchy navigation; image + video thumbnails (sharp/ffmpeg) and full-screen photo / in-browser video playback; responsive SPA usable at 360 px (SC-005); upload/download/move/rename/delete/create-folder/preview reachable without docs; explicit loading/error states; keyset pagination + lazy thumbnails for large libraries. |
| **V. Reliable Sync & Data Integrity** | All access over TLS (proxy); no plaintext FTP; atomic temp-file→rename writes with interrupted uploads discarded (FR-014); destructive ops are reversible via trash + retention (FR-007/008); the web transfer path honors auth + isolation (native background mobile sync is out of scope this feature). |
| **Security & Privacy Requirements** | TLS via hardened reverse proxy/VPN; at-rest volume encryption recommended in deployment guide; service runs least-privilege (non-root); auth events (login/failed/denied) logged without secrets or file contents; no phone-home. |
| **Development Workflow & Quality Gates** | This Constitution Check gates the plan; security + isolation changes carry negative tests; secrets externalized; SQLite + single deployable keep design simple; Drizzle migrations preserve existing data. |

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-cloud-drive/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml      # REST API contract
│   └── README.md         # Contract overview + conventions
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── index.ts             # Process entry (load config, start server)
│   ├── app.ts               # Fastify app factory: plugins, guards, routes
│   ├── config/              # Env loading + validation (secrets, paths, limits)
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema: users, sessions, nodes, trash, login_throttle
│   │   ├── client.ts        # SQLite (better-sqlite3) connection
│   │   └── migrations/      # Drizzle migrations (data-preserving)
│   ├── auth/                # Password hashing, sessions, login throttle, auth guard, roles
│   ├── storage/             # Per-user paths, path-traversal safety, atomic write/move
│   ├── media/               # sharp image thumbs, ffmpeg video posters, range streaming
│   ├── modules/
│   │   ├── nodes/           # browse/list, create folder, rename, move, delete→trash, search
│   │   ├── files/           # upload (multipart→atomic), download (range), thumbnail
│   │   ├── trash/           # list, restore, purge, empty, retention sweep
│   │   └── users/           # owner provisioning/removal, password change/reset
│   ├── middleware/          # error handler, request logging, rate limit wiring
│   └── lib/                 # ids, pagination (keyset), errors, validation helpers
└── tests/
    ├── unit/
    ├── integration/         # API + per-user ISOLATION negative tests (gating)
    └── fixtures/

frontend/
├── index.html
├── src/
│   ├── main.tsx
│   ├── app/                 # responsive app shell, routing, auth boundary
│   ├── pages/               # Login, Browse, Preview, Trash, Account/Settings, Admin (users)
│   ├── components/          # FileGrid, Thumbnail, PhotoViewer, VideoPlayer, Uploader, etc.
│   ├── features/            # auth, nodes, upload, search, trash (hooks + API calls)
│   ├── api/                 # typed API client (shared request/response types)
│   ├── hooks/
│   └── styles/              # responsive CSS (mobile-first)
└── tests/                   # Vitest component/unit tests

e2e/                         # Playwright specs (desktop + mobile viewports)
└── tests/                   # auth, browse/preview, upload/download, organize, isolation
```

**Structure Decision**: Web application layout (Option 2) — a `backend/` Fastify API and a
`frontend/` React+Vite SPA, plus a top-level `e2e/` Playwright suite. In production the backend
serves the built SPA via `@fastify/static`, yielding a single self-hosted deployable that matches
Constitution Principle III (single machine, no mandatory external services). Backend modules are
organized by domain (nodes/files/trash/users) with cross-cutting `auth/`, `storage/`, and
`media/` layers so the isolation and security guarantees live in shared, testable choke points.

## Complexity Tracking

> No constitution violations — no entries required.

*Post-Design Constitution Re-Check (after Phase 1): PASS. The data model enforces `owner_id`
scoping and a uniform not-found response; the API contract requires authentication on every
endpoint and exposes no cross-user surface; storage uses per-user roots with atomic writes. No
new complexity or external dependency was introduced beyond the documented stack.*
