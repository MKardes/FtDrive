# API Contracts — FtDrive Video Downloads (feature 002)

This folder defines the HTTP interface for the **download-videos-from-web** feature. It **extends**
the core FtDrive contract (`specs/001-personal-cloud-drive/contracts/`) — all of that document's
conventions apply here unchanged.

- **`openapi.yaml`** — OpenAPI 3.1 description of the `/downloads` endpoints, request/response
  schemas, and status codes.

## Conventions (enforced by every endpoint)

- **Auth required everywhere.** All endpoints sit under the existing `/api` default-deny session
  guard (`ftdrive_session` cookie). Missing/expired/revoked session → `401`.
- **Per-user isolation (Principle II).** Every download is scoped to the authenticated user. A
  request for a download that is not owned by the caller is **indistinguishable** from one that
  does not exist — both return the same `404 NOT_FOUND`. No endpoint exposes another user's
  downloads, ids, counts, progress, or history.
- **Destination ownership.** `destinationFolderId` must be a live folder owned by the caller
  (resolved with the same `resolveOwnedFolderOrThrow404` used elsewhere); a non-owned/missing
  folder returns the uniform `404`. Omitting it targets the user's auto-created **"Downloads"**
  folder (FR-003).
- **SSRF safety (FR-013).** The submitted URL — and any media URL the server resolves — must be
  `http`/`https` and must **not** resolve to a private/loopback/link-local/reserved/self address,
  re-checked across redirects. Blocked URLs return `400` with a **generic** message (no internal
  detail leaked).
- **Integrity (FR-010).** A download becomes a visible file **only** on full success, via the same
  atomic temp→fsync→rename→commit path as uploads. Cancelled/failed/interrupted downloads leave
  **no** node and no partial file. Name collisions keep both by suffixing (never overwrite,
  FR-018).
- **Bounds (FR-014/FR-015/FR-020).** Max **5** active downloads per user (the rest queue); each
  download is bounded by a wall-clock time limit and an absolute size ceiling; totals are bounded
  by the user's storage quota. Pre-flight breaches → `409`; mid-stream breaches → `failed` with a
  retryable reason.
- **Availability.** When downloads are disabled or the extraction tool is missing on the host,
  mutating/examine endpoints return `503`; the rest of FtDrive is unaffected.
- **Opaque ids and cursors.** Download ids are opaque ULIDs; history uses opaque keyset
  `cursor`/`nextCursor` (no offsets, no sequential ids).
- **Errors** use the uniform envelope `{ "error": { "code", "message" } }`.
- **Progress** is read by polling `GET /downloads` / `GET /downloads/{id}` (`status`,
  `bytesDownloaded`, `totalBytes`); no separate streaming transport.
- **Transport.** Served over TLS in production via the reverse proxy; the API listens on local
  HTTP behind it.

## Endpoint groups

| Group | Endpoints | Spec refs |
|-------|-----------|-----------|
| Examine | `POST /downloads/examine` | FR-001, FR-002, FR-004, FR-016, US1/US3 |
| Create/list | `POST /downloads`, `GET /downloads` | FR-003, FR-005, FR-007, FR-011–FR-015, FR-018, FR-020 |
| Item | `GET /downloads/{id}`, `DELETE /downloads/{id}` | FR-007, FR-012, FR-017 |
| Control | `POST /downloads/{id}/cancel`, `POST /downloads/{id}/retry` | FR-008, FR-009, FR-010 |
| History | `DELETE /downloads` (clear terminal) | FR-017 |

## Relationship to the resulting file

A completed download produces an ordinary **file node** (feature-001 `nodes`), reachable through
all existing `/folders`, `/files`, `/nodes`, and `/trash` endpoints — thumbnail, range playback,
rename/move/delete included. The only new linkage is `Download.nodeId` (origin). Deleting the file
(normal trash) does not delete its download history record; clearing history does not delete files.

These contracts are the source of truth for both the backend route schemas and the frontend typed
API client; integration tests assert the auth, isolation, SSRF, atomicity, and bound behaviors
described above (all gating).
