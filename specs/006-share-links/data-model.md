# Data Model: File & Folder Sharing (006-share-links)

One new table plus one new column on `users`. Everything else is derived views over existing
`users`/`nodes` rows.

## Column: `users.email` (migration `0004_user_email`, amendment 2026-07-15)

Optional, owner-managed addressing identity for direct shares (research.md §12). Nullable
TEXT, stored **trimmed + lowercased**, with partial unique index `users_email_unique` on
`email WHERE email IS NOT NULL` (case-insensitive in effect because values are normalized at
write time). Grants reference `users.id`, never the email — changing/clearing an email only
changes how the person is displayed and found in the picker.

## Table: `shares` (migration `0003_shares`)

One row per grant (research.md §1). A **link share** has `kind='link'`, a `token`, and no
recipient. A **direct share** has `kind='user'`, a `recipient_id`, and no token.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | ULID (`lib/ids.ts`), consistent with all entities |
| `owner_id` | text | NOT NULL, FK → `users.id` ON DELETE CASCADE | The sharing user. Isolation key for management queries |
| `node_id` | text | NOT NULL, FK → `nodes.id` ON DELETE CASCADE | Shared file/folder. Cascade ends grants on permanent delete (FR-010) |
| `kind` | text | NOT NULL, enum `'link' \| 'user'` | |
| `token` | text | NULL | Only for `kind='link'`: 43-char base64url of 32 random bytes (research.md §3) |
| `recipient_id` | text | NULL, FK → `users.id` ON DELETE CASCADE | Only for `kind='user'`. Cascade removes grants when the account is removed |
| `created_at` | integer | NOT NULL | epoch ms |
| `expires_at` | integer | NULL | epoch ms; NULL = never expires (FR-008) |

**Indexes**

| Index | Definition | Purpose |
|-------|------------|---------|
| `shares_token_unique` | UNIQUE(`token`) | O(1) public resolution; global token uniqueness |
| `shares_link_node_unique` | UNIQUE(`node_id`) WHERE `kind='link'` | at most one active link per item (FR-013; revoke deletes the row, so re-sharing works) |
| `shares_user_node_recipient_unique` | UNIQUE(`node_id`, `recipient_id`) WHERE `kind='user'` | direct-share dedupe (FR-013) |
| `shares_owner_idx` | (`owner_id`, `created_at`) | owner's "My shares" listing |
| `shares_recipient_idx` | (`recipient_id`) | "Shared with me" listing |
| `shares_node_idx` | (`node_id`) | per-item share panel |
| `shares_expires_idx` | (`expires_at`) | maintenance sweep of expired rows |

**Row validity ("active")** — a share row authorizes access iff:

1. `expires_at IS NULL OR expires_at > now` (expired rows are dead even before the sweep
   deletes them), and
2. its node exists, is not trashed, and — for every resolution — the requested node is the
   shared root or a `parent_id`-chain descendant of it, every chain node owned by
   `share.owner_id` and live (research.md §4, §5).

**State transitions**: there is no status column. Created → (optionally re-dated via
`expires_at` PATCH) → deleted (revoke, expiry sweep, node purge cascade, account removal
cascade). "Suspended" (item in Trash) is a property of the node, not the share row.

## DTOs (API shapes; see contracts/openapi.yaml)

- **Share** (owner-facing): `{ id, nodeId, kind, token?, recipient?: { id, username },
  createdAt, expiresAt }` — `token` only on link shares, `recipient` only on direct shares.
- **ShareWithNode** (listings): Share + `node: { id, name, type }` so "My shares" doesn't need
  N extra lookups.
- **SharedWithMeItem** (recipient-facing): `{ shareId, createdAt, expiresAt, owner:
  { username }, node: NodeDto }` — the full `NodeDto` so the grid/thumbnail components work
  unchanged.
- **PublicShareInfo** (anonymous): `{ node: NodeDto }` with the shared root's `parentId`
  presented as `null` (research.md §11). Never includes owner identity, expiry, or counts.
- **DirectoryUser** (recipient picker): `{ id, username, email }` — active users excluding the
  caller. Nothing else. The share `recipient` object carries the same three fields.
- Share-scoped children listings reuse the existing `Page<NodeDto>` keyset shape
  (`lib/pagination.ts`) unchanged.

## Relationships

```text
users 1 ──< shares (owner_id)      owner's grants; cascade on account removal
users 1 ──< shares (recipient_id)  received grants; cascade on account removal
nodes 1 ──< shares (node_id)       grants on an item; cascade on permanent delete
```

No changes to `users`, `nodes`, `sessions`, `login_throttle`, or `downloads`.
