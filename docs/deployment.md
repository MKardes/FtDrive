# FtDrive — Deployment Guide

FtDrive is a self-hosted, single-deployable personal cloud drive. In production the backend
serves both the JSON API (`/api/*`) and the built React SPA from one origin, so you run **one Node
process** behind a TLS-terminating reverse proxy.

This guide covers a production install on a single Linux host. It assumes you are comfortable with
systemd and a reverse proxy.

---

## 1. Prerequisites

- **Node.js 22 LTS** (the build targets `node22`).
- **`ffmpeg`** on the host `PATH` — required for **video poster thumbnails**. FtDrive degrades
  gracefully if it is missing (videos still upload, stream, and play; their grid poster just shows
  a generic icon and `thumb_status` becomes `unsupported`). Image thumbnails use the bundled
  `sharp` and need no system package.
  - Debian/Ubuntu: `sudo apt-get install -y ffmpeg`
  - On startup the server logs a one-line warning if `ffmpeg` is not found, so you can confirm at a
    glance whether video posters will be generated.
- **`yt-dlp`** on the host `PATH` (or point `YT_DLP_PATH` at it) — required for the **download-from-web**
  feature (paste a URL, download its video into your drive). It also reuses `ffmpeg` above to merge
  segmented (HLS/DASH) streams. Pin a known version and keep it updated (sites change frequently).
  Without it, `DOWNLOADS_ENABLED` still defaults to `true` but the feature reports `503` on every
  request — the rest of FtDrive is unaffected.
  - Recommended install (avoids OS package conflicts): `pipx install yt-dlp` or a venv
    (`python3 -m venv /opt/ftdrive/yt-dlp-venv && /opt/ftdrive/yt-dlp-venv/bin/pip install yt-dlp`),
    then set `YT_DLP_PATH=/opt/ftdrive/yt-dlp-venv/bin/yt-dlp`.
- **Headless Chromium** for the JS-render fallback the download feature uses when static extraction
  finds no video (FR-019) — install Playwright's browser once: `npx playwright install --with-deps chromium`
  (run from the deployed `backend/` directory, or wherever `playwright` was installed as a dependency).
  Only used when `yt-dlp` alone can't find the video; the rest of downloads works without it.
- A **reverse proxy** that terminates TLS (Caddy is shown below; nginx/Traefik work too).
- A dedicated, **least-privilege service user** (see §5). For hardening, consider running the
  download feature's outbound fetches (yt-dlp + headless Chromium) behind an **egress filter or
  network namespace** so only the internet (not your other internal services) is reachable — the SSRF
  guard (below) already refuses loopback/private/link-local targets by default, but defense in depth
  is cheap here since this is the app's only outbound, user-triggered network path.

---

## 2. Build

```bash
npm ci
npm run build         # builds the SPA (frontend/dist) then bundles the API (backend/dist)
```

The single deployable is `backend/dist/index.js`; it serves `frontend/dist` automatically. If you
relocate the SPA build, point the server at it with `WEB_ROOT=/path/to/frontend/dist`.

---

## 3. Configuration (environment only)

All secrets come from the environment — never commit them. Validated fail-fast at startup.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SESSION_SECRET` | **yes** | — | ≥ 32 chars; signs session cookies. Generate with `openssl rand -base64 48`. |
| `DATA_ROOT` | recommended | `./data` | Per-user blob/thumb storage + SQLite live here. Put it on the encrypted volume (§4). |
| `DATABASE_PATH` | no | `<DATA_ROOT>/ftdrive.db` | SQLite file (WAL mode). |
| `NODE_ENV` | yes (prod) | `development` | Set to `production` to enable `Secure` cookies + SPA serving. |
| `HOST` / `PORT` | no | `0.0.0.0` / `3000` | Bind address; keep behind the proxy (bind `127.0.0.1` if proxy is local). |
| `TRUST_PROXY` | yes, behind a proxy | `false` | Set `true` so client IPs (for throttling/audit) come from `X-Forwarded-For`. Only enable when a trusted proxy sets that header. |
| `MAX_UPLOAD_BYTES` | no | `5368709120` (5 GB) | Per-file upload ceiling (returns 413 above it). |
| `TRASH_RETENTION_DAYS` | no | `30` | Days a trashed item is recoverable before the sweep purges it. |
| `SESSION_TTL_DAYS` | no | `30` | Absolute session lifetime. |
| `WEB_ROOT` | no | `../frontend/dist` | Override the SPA directory if you relocate the build. |
| `OWNER_BOOTSTRAP_USERNAME` / `OWNER_BOOTSTRAP_PASSWORD` | one-time | — | Used by the `create-owner` CLI so the password never hits shell history. |
| `DOWNLOADS_ENABLED` | no | `true` | Master on/off for download-from-web. `false` (or a missing/broken `yt-dlp`) makes every downloads endpoint return `503`; the rest of FtDrive is unaffected. |
| `YT_DLP_PATH` | no | `yt-dlp` | Path to the `yt-dlp` binary (see §1). |
| `DOWNLOAD_MAX_CONCURRENCY_PER_USER` | no | `5` | Simultaneous downloads per user; the rest queue. |
| `DOWNLOAD_MAX_BYTES` | no | `21474836480` (20 GB) | Absolute per-download size ceiling. |
| `DOWNLOAD_MAX_DURATION_MS` | no | `21600000` (6 h) | Per-download wall-clock cap. |
| `DOWNLOAD_EXAMINE_TIMEOUT_MS` | no | `30000` (30 s) | Bound on examination, including the headless-browser fallback. |
| `USER_STORAGE_QUOTA_BYTES` | no | `0` (unlimited) | Per-user total storage limit, computed from live file sizes. |
| `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES` | no | `false` | Opt-in only: lets the SSRF guard allow loopback/private/LAN download targets. Leave `false` unless you deliberately want to fetch from your own network. |

There is **no public signup**. Provision the first owner once:

```bash
OWNER_BOOTSTRAP_USERNAME=owner OWNER_BOOTSTRAP_PASSWORD='<strong-secret>' \
  node backend/dist/cli/create-owner.js
```

The owner then provisions every other user from the in-app **Users** page.

---

## 4. At-rest encryption

FtDrive keeps all data self-hosted under `DATA_ROOT` (file bytes) and the SQLite database. For
encryption at rest, place `DATA_ROOT` on an encrypted volume — e.g. **LUKS** (`cryptsetup`) for a
whole disk/partition, or a per-directory layer such as **fscrypt/gocryptfs**. FtDrive does not
implement its own blob encryption; it relies on the filesystem/volume layer so keys and unlock
policy stay under your control. Back up the encrypted volume and the SQLite file together
(stop the service or snapshot the volume for a consistent copy).

---

## 5. Run as a least-privilege systemd service

Create a dedicated user that owns only `DATA_ROOT`:

```bash
sudo useradd --system --home /opt/ftdrive --shell /usr/sbin/nologin ftdrive
sudo mkdir -p /opt/ftdrive /srv/ftdrive-data
sudo chown -R ftdrive:ftdrive /opt/ftdrive /srv/ftdrive-data
# deploy the built repo to /opt/ftdrive (or just backend/dist + frontend/dist + node_modules)
```

`/etc/systemd/system/ftdrive.service`:

```ini
[Unit]
Description=FtDrive personal cloud
After=network.target

[Service]
User=ftdrive
Group=ftdrive
WorkingDirectory=/opt/ftdrive
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=TRUST_PROXY=true
Environment=DATA_ROOT=/srv/ftdrive-data
EnvironmentFile=/etc/ftdrive/secrets.env   # SESSION_SECRET=... (root-only, chmod 600)
ExecStart=/usr/bin/node /opt/ftdrive/backend/dist/index.js
Restart=on-failure

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/ftdrive-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ftdrive
```

The server runs scheduled maintenance itself (expired-session purge, orphaned-upload-temp sweep,
and trash retention sweep) on startup and hourly — no cron needed.

---

## 6. Reverse proxy + TLS (Caddy)

Caddy gets and renews certificates automatically. `Caddyfile`:

```
drive.example.com {
    encode zstd gzip
    # Allow large uploads (match or exceed MAX_UPLOAD_BYTES).
    request_body {
        max_size 5GB
    }
    reverse_proxy 127.0.0.1:3000
}
```

Notes:
- The app sets `Secure`, `HttpOnly`, `SameSite=Lax`, signed session cookies in production, plus
  baseline security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy: same-origin`). A stricter app-wide `Content-Security-Policy` is best
  added at the proxy where you can tune it to your asset hashes.
- Because `TRUST_PROXY=true`, **only** expose the app through the proxy; never bind it to a public
  interface directly, or clients could spoof `X-Forwarded-For` and defeat login throttling.
- Raise upstream/proxy body-size and timeout limits to accommodate large uploads.

---

## 7. Upgrades & backups

- **Upgrade**: `git pull` (or deploy new artifacts) → `npm ci && npm run build` → restart the
  service. Database migrations run automatically on startup.
- **Backup**: snapshot the encrypted `DATA_ROOT` volume (blobs + thumbs + SQLite). For a hot copy
  without a snapshot, back up the `*.db`, `*.db-wal`, and `*.db-shm` files together while the
  service is briefly stopped.

---

## 8. Quick verification

```bash
curl -fsS https://drive.example.com/api/health           # {"status":"ok"}
# Sign in, then confirm the API is auth-gated:
curl -fsS -o /dev/null -w '%{http_code}\n' https://drive.example.com/api/folders/root/children
# → 401 without a session cookie (default deny)
```

See `specs/001-personal-cloud-drive/quickstart.md` for the full user-story validation script.
