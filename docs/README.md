# FtDrive

A self-hosted, Google Drive–like **personal cloud drive**. Sign in to a private, per-user library;
browse folders and media with thumbnails; open photos full-screen and stream videos; upload and
download from any device; organize with rename/move and a recoverable trash. Multi-user with strict
server-side isolation — every user sees only their own data.

> Single binary-ish deployment: one Node process serves the API **and** the SPA on one origin.

## Highlights

- **Private by default.** Every data path is authenticated (default deny); cross-user access returns
  a uniform `404` that reveals nothing (no existence, count, or timing leak).
- **Self-hosted.** File bytes live on your filesystem under per-user roots; metadata in SQLite. No
  third-party storage. Encrypt at rest at the volume layer.
- **Crash-safe writes.** Uploads stream to a temp file, `fsync`, then atomically rename — an
  interrupted upload never leaves a partial/corrupt blob.
- **Media.** Image thumbnails via `sharp` (EXIF-aware); video posters via system `ffmpeg`
  (degrades gracefully if absent). HTTP Range streaming for video seek.
- **Organize + trash.** Create/rename/move (cycle- and collision-safe, "keep both"); delete to a
  recoverable trash with a retention sweep.
- **Mobile-first.** Usable down to a 360px viewport; phone camera capture on upload.

## Tech stack

TypeScript · Node.js 22 · Fastify · React + Vite · SQLite (Drizzle ORM) + local filesystem ·
Argon2id + server-side sessions · `sharp`/`ffmpeg` thumbnails · Vitest + Playwright.

## Repository layout

| Path | What |
|------|------|
| `backend/` | Fastify API, auth/isolation, storage, media, SQLite (Drizzle), CLI, tests |
| `frontend/` | React + Vite SPA (browse, upload, organize, trash, admin, account) |
| `e2e/` | Playwright end-to-end specs (desktop + 360px mobile) |
| `docs/` | This README + the [deployment guide](./deployment.md) |
| `specs/001-personal-cloud-drive/` | Spec, plan, data model, OpenAPI contract, quickstart |

## Develop — two separate apps

In development the **backend is an API-only app** and the **frontend is its own Vite app**; they run
independently and Vite proxies `/api` → the backend. (The backend serves the built SPA *only* in
production — see [Run as a single deployable](#run-as-a-single-deployable).)

### Prerequisites

- **Node.js 22**.
- **`ffmpeg` on PATH** (e.g. `sudo apt install ffmpeg`) — required to generate video poster
  thumbnails, the single video frame shown on grid-view file cards. Image thumbnails work without
  it (they use `sharp`), and videos degrade to a type icon while `ffmpeg` is absent; poster
  generation resumes automatically once it is installed.

```bash
npm ci

# Backend config lives in backend/.env (auto-loaded by dev:backend + create-owner):
cp backend/.env.example backend/.env
# then set SESSION_SECRET in backend/.env  →  openssl rand -base64 36

# First owner (no public signup). Reads OWNER_BOOTSTRAP_* from backend/.env,
# or pass flags explicitly:
npm run create-owner -- --username owner --password 'owner-password-123'
```

Then run the two apps in separate terminals — **no env exports needed** (the backend reads
`backend/.env`):

```bash
npm run dev:backend     # API app  → http://localhost:3000  (API only; GET / → 404)
npm run dev:frontend    # SPA app  → http://localhost:5173  (use this in the browser)
```

Sign in at **http://localhost:5173**. Point the frontend at a different backend with
`BACKEND_URL=… npm run dev:frontend`.

### Run as a single deployable

For a production-style run, the backend serves the built SPA + API on one origin:

```bash
npm run build
NODE_ENV=production node backend/dist/index.js   # http://localhost:3000
```

(`NODE_ENV=production` also enables `Secure` cookies; over plain HTTP use `localhost`, which browsers
treat as a secure context. Real deployments sit behind TLS — see the deployment guide.)

## Test

```bash
npm test            # backend integration (Vitest) + frontend component (Vitest)
npm run typecheck   # backend + frontend
npm run lint

# End-to-end (needs a built app + browsers):
npm run build
npx playwright install chromium                      # one-time, in e2e/
# boot the app (see below) then:
BASE_URL=http://localhost:3000 npm run test:e2e
```

The E2E suite runs against the production single deployable. Boot it with a seeded owner
(`owner` / `owner-password-123` by default, overridable via `E2E_USERNAME`/`E2E_PASSWORD`):

```bash
NODE_ENV=production PORT=3000 DATA_ROOT=./e2e-data \
  SESSION_SECRET=test-secret-at-least-32-characters-long \
  OWNER_BOOTSTRAP_USERNAME=owner OWNER_BOOTSTRAP_PASSWORD=owner-password-123 \
  node backend/dist/cli/create-owner.js && node backend/dist/index.js
```

## Deploy

See the **[deployment guide](./deployment.md)** for a hardened systemd + Caddy/TLS setup,
at-rest encryption, the `ffmpeg` prerequisite, and backups.

## Security model (constitution)

1. **Authenticate every data path** (default deny). Only `POST /auth/login` is public.
2. **Strict per-user isolation**, enforced server-side at the data-access layer; cross-user →
   uniform `404`.
3. **Self-hosted** data; **atomic, crash-safe** file writes; **secrets from env only**.

These are non-negotiable and covered by gating auth + isolation tests that must pass before merge.
