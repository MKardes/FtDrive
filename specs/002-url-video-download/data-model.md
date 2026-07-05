# Phase 1 Data Model: Download Videos from Web Pages to Drive

This feature adds **one** metadata table, **`downloads`**, to the existing SQLite database. It
does **not** change `users`, `sessions`, or `nodes`. The resulting video is an ordinary `nodes`
row (created via the existing `insertFileNode` path); the download's link to it (its "origin") is
stored on the `downloads` row as `node_id`.

**Isolation invariant (Principle II):** every query against `downloads` is filtered by
`owner_id = currentUser.id` at the data-access layer **and** re-checked before anything is
returned. A request for a non-owned **or** non-existent download yields the **same**
`404 NOT_FOUND` — no existence disclosure via id, count, error, or timing. The download's
destination and resulting node are resolved/created with the existing owner-scoped node helpers
(`resolveOwnedFolderOrThrow404`, `resolveAvailableName`, `insertFileNode`).

---

## Entity: Download (job + history record)

Table `downloads`. All ids are opaque ULIDs.

| Field | Type | Notes |
|-------|------|-------|
| `id` | text (PK) | Opaque ULID |
| `owner_id` | text (FK→User.id, `ON DELETE CASCADE`) | **Isolation key**; indexed |
| `source_url` | text | The URL the user submitted (page or direct video) |
| `destination_parent_id` | text (FK→Node.id) \| null | Chosen folder; `null` ⇒ resolve to the user's "Downloads" folder at finalize |
| `selection` | text \| null | Chosen `formatId`/candidate, or `null`/`"best"` ⇒ best available quality of the primary video |
| `title` | text \| null | Resolved video title (used for the filename + display); populated after examine |
| `status` | text | `queued` \| `examining` \| `downloading` \| `completed` \| `failed` \| `canceled` |
| `bytes_downloaded` | integer | Progress; default `0` |
| `total_bytes` | integer \| null | Expected size when known (may be unknown for some streams) |
| `node_id` | text (FK→Node.id) \| null | The resulting file node once `completed` (origin link); `null` otherwise |
| `error_code` | text \| null | Machine code for a failure (e.g. `NO_VIDEO_FOUND`, `SIZE_LIMIT`, `TIME_LIMIT`, `QUOTA_EXCEEDED`, `SOURCE_UNAVAILABLE`, `DRM_PROTECTED`, `URL_NOT_ALLOWED`, `INTERRUPTED`) |
| `error_message` | text \| null | Human-readable reason shown to the user (FR-009) |
| `attempt` | integer | Retry counter; default `0`, incremented on retry/reconciliation |
| `created_at` | integer (epoch ms) | |
| `updated_at` | integer (epoch ms) | Bumped on every state/progress write |
| `started_at` | integer \| null | When a worker began `examining` |
| `finished_at` | integer \| null | When it reached a terminal state |

**Indexes / constraints**:
- `INDEX (owner_id, created_at)` — per-user history listing (ordered `created_at DESC`), keyset
  paginated like other lists.
- `INDEX (owner_id, status)` — count a user's **active** jobs (`queued`/`examining`/`downloading`)
  to enforce the 5-per-user concurrency cap, and to list active vs. terminal.
- `INDEX (status, created_at)` — worker claim scan for the oldest `queued` jobs across users.
- FK `owner_id → users.id ON DELETE CASCADE` — removing a user removes their download records
  (their files are already cascade-removed via `nodes`).
- `node_id` references a node but is **not** cascade-linked from nodes: if the user later deletes
  the downloaded file (normal trash), the history row remains with a now-dangling `node_id` that
  the API renders as "file no longer present" (the history record itself is only cleared by the
  user, FR-017).

**Validation rules**:
- `source_url`: must be a syntactically valid `http`/`https` URL **and** pass the SSRF guard
  (`lib/url-guard`) before a job is created or examined; otherwise the request is rejected
  (`URL_NOT_ALLOWED` / validation error) and no row is created.
- `destination_parent_id` (when set): must reference a **live folder owned by the same user**
  (`resolveOwnedFolderOrThrow404`); a non-owned/missing folder yields a uniform 404.
- `total_bytes`/`bytes_downloaded`: non-negative; `bytes_downloaded ≤ total_bytes` when
  `total_bytes` is known; both bounded by `DOWNLOAD_MAX_BYTES` and the user's remaining quota.
- Terminal rows (`completed`/`failed`/`canceled`) are immutable except for user-initiated
  **delete** (history clear); only `completed` rows have a non-null `node_id`.

**State transitions** (worker-driven unless noted):
```
                 create (POST /downloads)
                          │
                          ▼
                       queued ──cancel(user)──► canceled
                          │
                 worker claims (owner active < 5)
                          ▼
                     examining ──no video / DRM / unreachable──► failed
                          │      ──cancel(user)──► canceled (discard temp)
             resolve format / direct-URL shortcut (FR-004)
                          ▼
                    downloading ──size/time/quota breach──► failed (discard temp)
                          │      ──source error──► failed (discard temp)
                          │      ──cancel(user)──► canceled (discard temp)
        full success: commitTemp → insertFileNode → set node_id
                          ▼
                     completed
                          │
              retry(user) from failed/canceled ──► queued (attempt+1, bytes=0)
              startup reconciliation of in-flight ──► queued (attempt+1, temp discarded)
```
- A node becomes visible **only** on the `→ completed` edge (atomic commit), guaranteeing FR-010.
- `cancel` is valid only from a non-terminal state; `retry` only from `failed`/`canceled`.
- History **delete** (FR-017) removes the `downloads` row from any terminal state; it does **not**
  delete the resulting node (that goes through normal reversible trash).

---

## Transient (not persisted) structures

These are returned by the API but never stored, so they carry no isolation surface of their own.

### DetectedVideoCandidate (result of `POST /downloads/examine`)

Produced by probing the page (static, with headless fallback); represents one video found.

| Field | Type | Notes |
|-------|------|-------|
| `candidateId` | string | Opaque handle for this candidate within the examine result |
| `title` | string \| null | Video title where the page exposes it |
| `durationSec` | number \| null | Duration where known |
| `formats` | Format[] | Available qualities (may be one) |

**Format**: `{ formatId: string, quality: string \| null, width: number \| null, height:
number \| null, ext: string \| null, estimatedBytes: number \| null }`. When the user does not
choose, the highest-quality format of the primary candidate is used (FR-002/US3). An examine with
no video returns `{ videoFound: false }` (nothing is stored, nothing added to the drive).

---

## Reused entity: Node (the downloaded file)

No schema change. A completed download creates a normal **file** `Node` under the user's chosen
(or "Downloads") folder — same fields, `thumb_status` lifecycle, poster/playback, rename/move/
delete, and keep-both name resolution as an uploaded file. The only linkage is `downloads.node_id
→ nodes.id` (origin). The user's **default "Downloads" folder** is itself an ordinary folder Node,
created on first use if absent.

---

## Configuration (new, env-only — see research §10)

Not database rows, but the tunables this model depends on: `DOWNLOADS_ENABLED`, `YT_DLP_PATH`,
`DOWNLOAD_MAX_CONCURRENCY_PER_USER` (5), `DOWNLOAD_MAX_BYTES` (20 GB), `DOWNLOAD_MAX_DURATION_MS`
(6 h), `DOWNLOAD_EXAMINE_TIMEOUT_MS` (30 s), `USER_STORAGE_QUOTA_BYTES` (0 = unlimited),
`DOWNLOAD_ALLOW_PRIVATE_ADDRESSES` (false).

---

## Mapping to requirements

| Requirement | Model support |
|-------------|---------------|
| FR-001, FR-002, US3 | `POST /downloads/examine` → transient `DetectedVideoCandidate[]`; `title`/`total_bytes` captured on the row after probe |
| FR-003 | `destination_parent_id` (nullable) → resolves to owned folder or auto-created "Downloads" Node |
| FR-004 | direct-URL shortcut skips `examining` in the worker |
| FR-005, FR-007 | durable `downloads` row + worker; `status`, `bytes_downloaded`, `total_bytes` |
| FR-006, FR-010, FR-018 | `node_id` set only via atomic commit + `insertFileNode`; keep-both naming; no partial node ever created |
| FR-008 | `queued/examining/downloading → canceled`, temp discarded, no node |
| FR-009 | `error_code` + `error_message`; `retry` edge |
| FR-011 | endpoints under the `/api` default-deny guard (no column needed) |
| FR-012, Principle II | `owner_id` filter + re-check + uniform 404; opaque ULIDs |
| FR-013 | `source_url` (and resolved media URLs) validated by `lib/url-guard` before any fetch |
| FR-014, FR-020 | `total_bytes`/`bytes_downloaded` checked against `DOWNLOAD_MAX_BYTES`, `DOWNLOAD_MAX_DURATION_MS`, and per-user quota (`SUM(size)` of live nodes) |
| FR-015 | `(owner_id, status)` index → count active jobs, cap at 5, queue the rest |
| FR-016 | `error_code = DRM_PROTECTED`/`SOURCE_UNAVAILABLE` reported, never silent |
| FR-017 | per-user history via `(owner_id, created_at)`; user delete removes the row (not the file) |
