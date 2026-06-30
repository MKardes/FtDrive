# Phase 1 Data Model: FtDrive — Personal Cloud Drive Web Application

Storage is split: **SQLite** holds metadata (entities below); **the local filesystem** holds file
bytes under per-user roots (`DATA_ROOT/users/<userId>/blobs/…`, thumbnails under `…/thumbs/…`).
All identifiers are opaque (UUID/ULID) so they reveal nothing and cannot be enumerated.

**Isolation invariant (Principle II):** every query against `nodes`, `trash`, and `sessions` is
filtered by `owner_id = currentUser.id` at the data-access layer **and** re-checked before any
content/metadata is returned. A request for a non-owned **or** non-existent resource yields the
**same** `404 NOT_FOUND` (no existence disclosure via id, count, error, or timing).

---

## Entity: User

| Field | Type | Notes |
|-------|------|-------|
| `id` | text (PK) | Opaque ULID |
| `username` | text | Unique (case-insensitive); login identifier |
| `password_hash` | text | Argon2id hash — never returned by any API |
| `role` | text | `owner` \| `user` |
| `status` | text | `active` \| `disabled` (disabled cannot log in) |
| `created_at` | integer (epoch ms) | |
| `updated_at` | integer (epoch ms) | |

**Relationships**: owns many `nodes`, `sessions`. The first `owner` is bootstrapped via CLI/seed.

**Validation**: `username` 3–64 chars, allowed charset; password meets a minimum policy at
set-time (length ≥ 10); exactly one implicit root per user (see Node).

**Lifecycle**: created by owner → active ↔ disabled → removed (removal cascades the user's nodes,
sessions, and on-disk root; see Constraints).

---

## Entity: Session

| Field | Type | Notes |
|-------|------|-------|
| `id` | text (PK) | Opaque random token id (referenced by signed cookie) |
| `user_id` | text (FK→User.id) | Indexed |
| `created_at` | integer | |
| `expires_at` | integer | Absolute expiry (sliding renewal optional) |
| `revoked_at` | integer \| null | Set on logout / admin revoke |
| `user_agent` | text \| null | For audit only |
| `ip` | text \| null | For audit only |

**Valid session** = `revoked_at IS NULL AND expires_at > now`. Auth guard rejects otherwise.

**Lifecycle**: created on login → valid → expired (time) or revoked (logout/admin) → purged by
sweep.

---

## Entity: Node (folder or file — unified tree)

| Field | Type | Notes |
|-------|------|-------|
| `id` | text (PK) | Opaque ULID |
| `owner_id` | text (FK→User.id) | **Isolation key**; indexed |
| `parent_id` | text (FK→Node.id) \| null | `null` ⇒ user's root folder |
| `type` | text | `folder` \| `file` |
| `name` | text | Display name (user-facing) |
| `size` | integer \| null | Bytes (files only) |
| `mime_type` | text \| null | Detected on upload (files only) |
| `storage_path` | text \| null | Opaque blob path relative to user root (files only) |
| `thumb_status` | text | `none` \| `pending` \| `ready` \| `unsupported` |
| `created_at` | integer | |
| `updated_at` | integer | |
| `trashed_at` | integer \| null | Non-null ⇒ in trash (see Trash view) |
| `trashed_expires_at` | integer \| null | Retention deadline (default now + 30d) |
| `original_parent_id` | text \| null | Saved on trash, used to restore |

**Indexes / constraints**:
- `INDEX (owner_id, parent_id)` — folder listings (keyset paginated).
- `INDEX (owner_id, name)` — name search (FR-021).
- `INDEX (trashed_at)` — retention sweep.
- `PARTIAL UNIQUE (owner_id, parent_id, name) WHERE trashed_at IS NULL` — no two live siblings
  share a name; collisions resolved by "keep both" suffixing (FR-013).

**Validation rules**:
- `name`: non-empty, ≤ 255 chars, no path separators or reserved/control characters.
- `parent_id` (when set) must reference a **folder** owned by the same user and not trashed.
- Files have `size`, `mime_type`, `storage_path`; folders have none of these.
- **Move** (`parent_id` change): destination owned + is folder; reject if it would create a cycle
  (a folder cannot be moved into itself or a descendant).
- **No versioning**: replacing content is not supported; a re-upload of an existing name keeps
  both (FR-013).

**State transitions**:
```
(upload temp → fsync → atomic rename → COMMIT) ──► active
active ──rename/move──► active
active ──delete──► trashed        (set trashed_at, trashed_expires_at, original_parent_id)
trashed ──restore──► active        (clear trash fields; re-resolve name collision at target)
trashed ──purge / retention sweep──► deleted (DB row removed + blob + thumb deleted)
```
Deleting a folder trashes the subtree together; restoring brings the subtree back together.

---

## Entity: Trash (view over Node)

Trash is not a separate table — it is `nodes WHERE owner_id = ? AND trashed_at IS NOT NULL`.

- **List**: paginated, scoped to owner, ordered by `trashed_at DESC`.
- **Restore**: `original_parent_id` is the target; if that parent is gone, restore to root; if a
  name collision exists at the target, apply "keep both" suffixing.
- **Purge / empty**: permanent; requires explicit confirmation (FR-008); removes DB rows + blobs +
  cached thumbnails.
- **Retention**: a periodic sweep permanently removes nodes whose `trashed_expires_at < now`
  (default retention 30 days, configurable).

---

## Entity: LoginThrottle (brute-force defense, FR-020)

| Field | Type | Notes |
|-------|------|-------|
| `key` | text (PK) | Throttle key: `user:<username>` or `ip:<addr>` |
| `failed_count` | integer | Consecutive failures in the current window |
| `first_failed_at` | integer | Window start |
| `blocked_until` | integer \| null | Back-off deadline; requests before this are throttled |

**Behavior**: each failed login increments counters for both the account key and the source-IP
key; progressive back-off sets `blocked_until`. A successful login clears the account key. No
permanent lockout. Login responses are uniform regardless of which key is throttled or whether the
username exists (no enumeration).

---

## Derived / on-disk (not DB rows)

- **Blob**: the file's bytes at `DATA_ROOT/users/<owner_id>/blobs/<opaque path>` referenced by
  `Node.storage_path`. Written atomically (temp → rename).
- **Thumbnail/Poster**: cached derived image at `DATA_ROOT/users/<owner_id>/thumbs/<node_id>.*`;
  regenerable; served only after an ownership check.

## Mapping to requirements

| Requirement | Model support |
|-------------|---------------|
| FR-001/009/010, Principle II | `owner_id` filter + re-check + uniform 404; opaque ids |
| FR-002/006 | Node tree, `parent_id`, rename/move with cycle check |
| FR-003 | `mime_type`, `thumb_status`, blob + thumb on disk |
| FR-004/005/014 | atomic blob write; `size`/`storage_path`; discard temp on failure |
| FR-007/008, Trash | `trashed_at`/`trashed_expires_at`/`original_parent_id`; purge confirm |
| FR-013 | partial unique index + keep-both; no versioning |
| FR-015/022 | `User.role`/`status`; password change/reset (hash rotation) |
| FR-017/019 | `password_hash` (Argon2id); `Session` expiry + revoke |
| FR-020 | `LoginThrottle` |
| FR-021 | `(owner_id, name)` index, owner-scoped `LIKE` |
