# API Contracts — FtDrive

This folder defines the interface FtDrive exposes to its own web UI (the SPA) over HTTP.

- **`openapi.yaml`** — OpenAPI 3.1 description of every REST endpoint, request/response schema,
  and status code.

## Conventions (enforced by every endpoint)

- **Auth required everywhere** except `POST /auth/login`. Authentication uses a signed,
  `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (`ftdrive_session`). Missing/expired/revoked
  session → `401`.
- **Per-user isolation (Principle II).** Every resource is scoped to the authenticated user. A
  request for a resource that is not owned by the caller is **indistinguishable** from one that
  does not exist — both return the same `404 NOT_FOUND`. No endpoint exposes another user's ids,
  names, counts, or thumbnails.
- **Owner-only routes** (`/admin/*`) additionally require `role = owner`; otherwise `403`.
- **Opaque ids and cursors.** Resource ids are opaque ULIDs; pagination uses opaque keyset
  `cursor`/`nextCursor` (no offsets, no sequential ids).
- **Errors** use a uniform envelope: `{ "error": { "code", "message" } }`.
- **Media.** `GET /files/{id}/content` supports HTTP `Range` (`206 Partial Content`) for video
  seeking; `GET /files/{id}/thumbnail` is ownership-checked like content.
- **Integrity.** `POST /files` streams to a temp file and commits atomically; an interrupted
  upload yields no visible/partial node (FR-014). Destructive purges (`DELETE /trash...`) require
  an explicit `confirm` flag (FR-008).
- **Transport.** Served over TLS in production via a reverse proxy; the API itself listens on
  local HTTP behind that proxy.

## Endpoint groups

| Group | Endpoints | Spec refs |
|-------|-----------|-----------|
| Auth/session | `/auth/login`, `/auth/logout`, `/auth/me` | FR-001, FR-017, FR-019, FR-020 |
| Account | `/account/password` | FR-022 |
| Browse | `/folders/{id}/children` | FR-002, FR-011, FR-012 |
| Folders/files | `/folders`, `/files`, `/files/{id}/content`, `/files/{id}/thumbnail` | FR-003–FR-005, FR-014 |
| Organize | `/nodes/{id}` (PATCH rename/move, DELETE→trash) | FR-006, FR-007, FR-013 |
| Search | `/search` | FR-021 |
| Trash | `/trash`, `/trash/{id}/restore`, `/trash/{id}` | FR-007, FR-008 |
| Admin (owner) | `/admin/users`, `/admin/users/{id}`, `/admin/users/{id}/password-reset` | FR-015, FR-022 |

These contracts are the source of truth for both the backend route schemas and the frontend typed
API client; integration tests assert the isolation/auth behaviors described above.
