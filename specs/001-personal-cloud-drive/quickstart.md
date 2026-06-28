# Quickstart & Validation Guide: FtDrive

This guide gets FtDrive running locally and validates the feature end-to-end against the spec's
user stories. It references [data-model.md](./data-model.md) and
[contracts/openapi.yaml](./contracts/openapi.yaml) rather than duplicating them. Implementation
code is produced in the implementation phase (`tasks.md`).

## Prerequisites

- **Node.js 22 LTS** and a package manager (npm or pnpm)
- **ffmpeg** installed and on `PATH` (video poster frames). Without it, video still uploads and
  streams; only posters degrade to a generic icon.
- A local directory for data (`DATA_ROOT`) on owner-controlled storage.

## Configuration (environment)

Set these before running (validated at startup; see research.md §14):

| Var | Purpose | Example / default |
|-----|---------|-------------------|
| `DATA_ROOT` | Root for per-user file storage | `./data` |
| `DATABASE_PATH` | SQLite metadata file | `./data/ftdrive.db` |
| `SESSION_SECRET` | Cookie signing secret (required) | (random ≥ 32 bytes) |
| `MAX_UPLOAD_BYTES` | Per-file upload limit | `5368709120` (5 GB) |
| `TRASH_RETENTION_DAYS` | Trash retention before purge | `30` |
| `TRUST_PROXY` | Trust `X-Forwarded-*` from reverse proxy | `false` (true in prod) |

Never commit secrets; provide them via the environment.

## Setup

```bash
# install deps for backend + frontend
npm install

# create the database schema
npm run db:migrate

# bootstrap the first OWNER account (one-time; no public signup)
npm run create-owner -- --username owner
```

## Run (development)

```bash
# terminal 1: API (http://localhost:3000)
npm run dev:backend

# terminal 2: SPA dev server (proxies /api to the backend)
npm run dev:frontend
```

## Run (production, single deployable)

```bash
npm run build              # builds backend + frontend
npm start                  # backend serves the built SPA and the API
# Front with a TLS-terminating reverse proxy (e.g., Caddy) or reach over VPN.
# At-rest volume encryption is recommended for the disk holding DATA_ROOT.
```

## Validation scenarios (map to spec user stories)

Run the app, sign in as the owner, and (for isolation) provision a second user via the Admin UI or
`POST /admin/users`.

### US1 — Sign in & browse private media (P1)
1. Visit the app **without** signing in → you are blocked from any file/listing (FR-001, SC-001).
2. Sign in → browse folders; photos/videos show thumbnails (FR-002/003).
3. Open a photo full-screen; play a video (it seeks via range requests) (FR-003).
4. Search by name → only your items appear (FR-021).
5. Let the session expire / sign out → access requires signing in again (FR-019).

### US2 — Upload & download from any device (P2)
1. In a folder, upload one or more files (try from a phone browser) → they appear with thumbnails
   within ~10 s (FR-004, SC-004).
2. Interrupt an upload (kill the tab/network) → no partial/corrupt file appears; re-initiate to
   complete (FR-014, SC-008).
3. Download a file → it is byte-for-byte identical (FR-005).
4. Upload a file with an existing name → both are kept (no overwrite) (FR-013).

### US3 — Organize my library (P3)
1. Create a folder; rename and move items → changes persist (FR-006).
2. Delete a file → it goes to **trash**, not gone (FR-007).
3. Restore it from trash → returns to original location (FR-007).
4. Delete a non-empty folder → requires confirmation; contents recover together (FR-008).

### US4 — Per-user isolation (P2, gating)
1. As user A, try to view/list/download/move/delete or search user B's items, including by
   guessing ids → **every** attempt returns a uniform `404`, revealing nothing (FR-009/010,
   SC-002).
2. Confirm user A's browse/search never surfaces user B's content.

### Responsive UI (cross-cutting)
- Use a 360 px-wide viewport: every primary action (browse, preview, upload, download, organize)
  is reachable without horizontal scrolling (FR-011, SC-005).

## Automated tests

```bash
npm test            # Vitest: backend unit + API integration, incl. isolation negative tests
npm run test:e2e    # Playwright: desktop + 360px mobile viewport across US1–US4
```

The isolation negative tests (US4) and auth tests (anonymous denied, session expiry/revocation,
login throttling) are **gating** per the constitution and must pass before merge.
