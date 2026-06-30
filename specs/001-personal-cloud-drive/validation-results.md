# Quickstart Validation Results (T075)

Date: 2026-06-30 · Branch: `feat/001-personal-cloud-drive`

Validates the four user stories end-to-end plus the 360px responsive requirement, against the
production **single deployable** (backend serving the API + built SPA on one origin).

## How it was run

```bash
npm run build
# seed the bootstrap owner, then boot the single deployable
NODE_ENV=production PORT=3000 DATA_ROOT=<tmp> SESSION_SECRET=<≥32 chars> \
  OWNER_BOOTSTRAP_USERNAME=owner OWNER_BOOTSTRAP_PASSWORD=owner-password-123 \
  node backend/dist/cli/create-owner.js && node backend/dist/index.js
BASE_URL=http://localhost:3000 npm run test:e2e   # desktop-chromium + mobile-360
```

## Automated suites

| Suite | Scope | Result |
|-------|-------|--------|
| Backend integration (Vitest) | auth, browse, upload, organize, trash, admin, account + **gating isolation** suites | **65 passed** |
| Frontend component (Vitest) | FileGrid, Thumbnail, Viewers, Uploader | **13 passed** |
| Typecheck | backend + frontend (`tsc --noEmit`) | clean |
| Lint | repo (`eslint .`) | clean (0 errors) |
| E2E (Playwright) | US1–US4 + performance, on **desktop-chromium** and **mobile-360 (360px)** | **26 passed** (13 per project) |

## User-story coverage (manual + E2E)

- **US1 — private browse/preview/search**: anonymous access is gated to login (401/redirect);
  owner browses folders/files, photo opens full-screen from `/content`, video plays via Range
  streaming, name search filters results. Isolation: a user never sees another's items.
- **US2 — upload/download**: multi-file upload (incl. mobile camera capture), atomic commit, the
  file appears in the grid, downloads byte-for-byte, duplicate name keeps both. Over-size → 413.
  Interrupted upload leaves no partial blob (storage temp→fsync→rename).
- **US4 — multi-user privacy**: owner provisions a user from the Users page; the new user signs in
  to an isolated **empty** drive and gets a uniform 404 for the owner's file ids; user changes their
  own password (old one rejected, other sessions revoked); owner removes the user (cascades space).
- **US3 — organize/trash**: create folder, rename, move (cycle→409, keep-both), delete a non-empty
  folder behind a confirm dialog → Trash → restore brings the subtree back; purge/empty are
  confirm-gated; retention sweep removes expired trash.

## Success criteria spot-checks (performance.spec.ts)

- **SC-006**: a 1,000-item folder shows first content in **< 2 s** (keyset pagination + lazy thumbs).
- **SC-004**: a freshly uploaded photo gets a thumbnail in **< 10 s**.
- **SC-003 / SC-005**: on a **360px** viewport, locate an item by name search and open it in **< 30 s**;
  list rows wrap so actions stay tappable.

## Environment note

`ffmpeg` was **not** installed on the validation host, so video **poster thumbnails** degraded to
`unsupported` (logged once at startup) — by design. Video upload, streaming, and playback are
unaffected. Install `ffmpeg` in production for video posters (see `docs/deployment.md`).
