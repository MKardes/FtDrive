# Research: File & Folder Sharing (006-share-links)

All findings below were verified against the current code on 2026-07-13 (branch `enhance-ui`,
post-005 UI). Each decision lists rationale and the alternatives considered.

## 1. Share records: one table, one row per grant

**Decision**: Single `shares` table; **each row is one grant**: a link share is a row with a
`token` and no recipient; a direct share is one row per `(node, recipient)`. "Share a folder
with 3 people" inserts 3 rows in one transaction.

**Rationale**: The spec requires per-recipient revocation (US2 #5) and link/direct dedupe
(FR-013). One-row-per-grant makes both trivial: revoke = delete one row; dedupe = partial
unique indexes (`(node_id) WHERE kind='link'`, `(node_id, recipient_id) WHERE kind='user'`).
Matches the flat-table style of `sessions`/`downloads`.

**Alternatives considered**: `shares` + `share_recipients` join table — more normalized but
adds a second table, two-step inserts, and join queries for zero functional gain at this scale.

## 2. Revoke = DELETE; expiry = timestamp check + sweep

**Decision**: Revoking deletes the row (no `revoked_at` tombstone). Expiration is an optional
`expires_at` epoch-ms column checked at resolution time (`expires_at IS NULL OR expires_at >
now`); the hourly maintenance job (`jobs/maintenance.ts`, verified: runs `runAll()` at startup
+ every hour) also hard-deletes expired rows.

**Rationale**: FR-012 requires revoked / expired / never-issued links to be indistinguishable.
Deleting rows makes "revoked" and "never existed" identical *by construction* — there is
nothing left to leak. Expired rows answer 404 immediately via the timestamp check even before
the sweep runs; the sweep is just hygiene. No requirement anywhere in the spec needs share
history.

**Alternatives considered**: soft-delete tombstones — would need extra filtering in every
query and careful non-disclosure handling for exactly zero user-visible benefit.

## 3. Link token: `crypto.randomBytes(32)` → base64url, stored as-is

**Decision**: 256-bit random token from `node:crypto`, base64url-encoded (43 chars), stored in
a unique-indexed `token` column, compared by exact lookup. Share URL is built **client-side**
as `${window.location.origin}/s/${token}` — the backend never needs to know its public origin.

**Rationale**: 256 bits satisfies SC-006 (enumeration infeasible) with huge margin. Storing
the raw token matches the existing precedent: session ids are stored raw in the `sessions`
table (verified `auth/sessions.ts` / `db/schema.ts`); the DB is on the owner's own disk
(Principle III), and tokens are individually revocable. Building URLs client-side avoids a new
`PUBLIC_ORIGIN` config knob.

**Alternatives considered**: storing only a hash of the token (defense-in-depth if the DB
leaks) — inconsistent with the existing session-id storage and complicates the owner's
"copy my existing link again later" flow (FR-006/US1 #5), which requires showing the link
after creation.

## 4. Isolation model: resolve the share first, then pin owner + subtree

**Decision**: A new `SharesRepository` is the only code that reads nodes on behalf of a share.
Every access path resolves the **share row first**:

- public: by `token` (+ active check),
- recipient: by `share id` + `recipient_id = authenticated user` (+ active check),
- owner management: by `share id` + `owner_id = authenticated user`.

The share row supplies `owner_id` and the shared root `node_id`. Every node read then filters
`nodes.owner_id = share.owner_id` **and** verifies the requested node is the shared root or a
descendant of it by walking the `parent_id` chain (same technique as
`NodeRepository.isSelfOrDescendant`, verified `modules/nodes/repository.ts:295`), rejecting
trashed nodes on the way. Any failure → the uniform `notFound()` from `lib/errors.ts`.

**Rationale**: Keeps `NodeRepository` untouched as the owner-scoped choke point (its header
comment declares that invariant) — we add a second, equally narrow choke point for
share-scoped reads instead of loosening the first one. Client-supplied `nodeId`s are never
trusted: they must prove membership in the resolved share's subtree.

**Alternatives considered**: (a) widening `NodeRepository` methods with an `allowShared` flag —
smears the isolation invariant across call sites; rejected. (b) Storing a materialized subtree
path per node — schema churn; parent-chain walk is O(depth), fine at this scale.

## 5. Trash/delete interplay needs no new hooks

**Decision**: No triggers or extra bookkeeping. Verified in `modules/nodes/repository.ts`:
`trashSubtree` marks **every** descendant `trashed_at` (not just the root), so the share-scoped
"node is live" check automatically suspends access to a trashed shared root *or* a shared node
inside a trashed ancestor (FR-010). `restoreSubtree` clears `trashed_at` on the subtree →
shares resume. `purgeSubtree`/`emptyTrash`/retention sweep delete node rows → `shares.node_id
… ON DELETE CASCADE` removes grants. Deleting a user cascades their nodes (existing FK) and
both their owned shares and their received grants (new FKs).

**Rationale**: The existing trash implementation already maintains the exact invariant the
spec needs; the share table only has to reference it with cascading FKs.

## 6. Anonymous routes: existing `public` + per-route rate-limit pattern

**Decision**: Public share routes are registered inside the same `/api` scope with
`config: { public: true, rateLimit: { max: 60, timeWindow: '1 minute' } }` — the exact
mechanism the login route already uses (verified `modules/auth/routes.ts:32-37`; the
default-deny guard honors `config.public`, verified `auth/guard.ts:15`; `@fastify/rate-limit`
is registered `global: false`, verified `app.ts:62`). Invalid/revoked/expired tokens get the
uniform 404; the rate limit answers 429 on abuse, satisfying FR-014.

**Alternatives considered**: a separate DB-backed throttle like `login_throttle` — login needs
per-account back-off semantics; token guessing only needs per-IP request capping, which the
plugin already provides.

## 7. Content/thumbnail streaming: extract, don't duplicate

**Decision**: Extract the `Range` parsing + 200/206/416 streaming logic from
`modules/files/content.ts` and the thumbnail ensure/send logic from
`modules/files/thumbnail.ts` into `modules/files/stream.ts` helpers that take an already
authorized `(ownerId, node)`. The owner routes keep their exact behavior; the recipient and
public share routes call the same helpers after share-scoped authorization.

**Rationale**: Video seek on share pages needs the same 206 handling; duplicating it is a
correctness risk (the parseRange edge cases are non-trivial, verified `content.ts:16-39`).
Authorization stays with the caller; the helper only streams.

## 8. Recipient picker: minimal authenticated user directory

**Decision**: New `GET /api/users` (any authenticated user) returning `[{ id, username }]` of
**active** users excluding the caller. Used only by the Share dialog.

**Rationale**: `GET /api/admin/users` is owner-only (verified `modules/users/admin.ts:29-32`,
`requireOwner`), so regular users have no way to address recipients. The spec explicitly
accepts username visibility between signed-in users (Assumptions). Excluding disabled accounts
prevents granting to dead accounts; excluding self enforces the no-self-share edge case at the
source (creation also re-validates server-side).

**Alternatives considered**: free-text username entry with exact-match lookup — avoids listing
names but makes the picker error-prone; rejected given the spec assumption.

## 9. Frontend reuse: URL-builder context instead of forked viewers

**Decision**: Add a `FileUrlContext` providing `{ contentUrl(id), thumbnailUrl(id) }`,
defaulting to the current owner endpoints (`api.files.contentUrl`/`thumbnailUrl`). `Thumbnail`,
`Preview`, `PhotoViewer`, `VideoPlayer` read from the context instead of importing `api`
directly (verified they hard-code `api.files.*Url` today: `Thumbnail.tsx:56`,
`Preview.tsx:64`). The shared-with-me browse view and the public `/s/:token` page wrap their
trees in a provider pointing at `/api/shared/:shareId/files/:id/…` or
`/api/public/shares/:token/files/:id/…`.

**Rationale**: The grid, lazy thumbnails, and photo/video viewers (incl. carousel nav and 004
polish) are exactly what share pages must show (FR-015); a context swap reuses them with a
one-line change per component, versus forking four components.

**Alternatives considered**: prop-drilling URL builders through
`FileGrid → Thumbnail`/`Browse → Preview → PhotoViewer/VideoPlayer` — five signatures churn vs
one context; rejected.

## 10. Public SPA route `/s/:token` works with the existing serving model

**Decision**: The public page is a normal SPA route outside `ProtectedRoute`. No server
changes needed for serving it: in production the backend already serves the SPA with a
client-side-routing fallback (verified `app.ts:86-92` + `registerNotFoundHandler`), and `/s/…`
is not under `/api` so the fallback applies; in development the Vite dev server serves it and
proxies `/api`.

**Note**: the page must not render owner chrome (`AppLayout` nav) and must not call
authenticated endpoints, so an anonymous visitor never triggers a login redirect.

## 11. Share-root presentation: `parentId` is nulled at the boundary

**Decision**: Share-scoped node DTOs present the shared root with `parentId: null` (children
keep real ids, which all live inside the subtree). Share listings/pages never include the
owner's ancestor path.

**Rationale**: The shared root's real `parent_id` points at a folder the visitor has no right
to know exists (Principle II: no leakage via IDs). Children's parent ids are in-subtree and
needed for navigation.

## 12. Email addressing resolves client-side against the directory (amendment, 2026-07-15)

**Decision**: Direct-share recipients are **addressed by email but granted by account id**.
`users` gains an optional, unique `email` column (owner-managed via the admin page; stored
trimmed+lowercased so a plain partial unique index is case-insensitive in effect). The
directory endpoint returns `{id, username, email}`; the Share dialog is a type-an-email picker
that filters the directory and turns matches into chips; `POST /shares` still receives
`recipientIds`. An email with no matching account shows "no user with that email" — nothing is
created or sent.

**Rationale**: The user's requirement is *addressing* people by email, not external
invitations. Resolving in the client against the (already-permitted) directory keeps the grant
API unchanged and keeps grants bound to accounts — changing or clearing an email re-labels the
person but never moves access. Server-side email delivery (SMTP) was explicitly not chosen and
would collide with the no-external-services default (Principle III).

**Alternatives considered**: (a) `recipientEmails` in the create body with server-side
resolution — a second addressing path to validate and keep uniform-404-safe, for no behavior
gain at this scale; (b) server-sent invitation emails — different feature, needs opt-in SMTP
config, rejected for now.

## 13. Testing approach

**Decision**: Backend integration tests follow the existing pattern (build app via
`tests/fixtures/app.ts`, real SQLite in temp dir): management CRUD + dedupe + uniform 404;
anonymous access incl. Range, subtree-escape, revoked/expired/invalid uniformity, rate-limit
429; recipient flows; and an `isolation-shares` suite mirroring the existing `isolation-*`
files (constitution gate for auth/file-access changes). Frontend: one Testing Library test for
the Share dialog against a mocked `api`, consistent with existing `frontend/tests`.
