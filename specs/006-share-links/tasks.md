# Tasks: File & Folder Sharing (Direct User Shares + Open Links)

**Input**: Design documents from `/specs/006-share-links/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: INCLUDED — the constitution's "Security & isolation are gating" rule requires tests
for any change touching authentication, authorization, or file access; this feature adds an
anonymous read path, so the isolation/uniform-404 suites are mandatory, not optional.

**Organization**: Grouped by user story. US1 (open link) is the MVP; US2 (direct shares) and
US3 (manage view) build on the same foundation but each phase is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (open link), US2 (direct shares), US3 (manage shares)

## Path Conventions

Web app per plan.md: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup (schema + shared types)

**Purpose**: The new `shares` table and the API types every story references.

- [X] T001 Add `shares` table (columns, FKs with ON DELETE CASCADE, partial unique indexes, lookup indexes per data-model.md) + `ShareRow`/`NewShareRow` types in `backend/src/db/schema.ts`
- [X] T002 Add migration `backend/src/db/migrations/0003_shares.ts` (CREATE TABLE + indexes matching T001) and append it to `backend/src/db/migrations/index.ts`
- [X] T003 [P] Add `ShareKind`, `Share`, `ShareWithNode`, `SharedWithMeItem`, `PublicShareInfo`, `DirectoryUser` types in `frontend/src/api/types.ts` (shapes per contracts/openapi.yaml)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The share-scoped data-access choke point, container wiring, and the streaming/URL
reuse refactors every story's routes and pages depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Implement `SharesRepository` in `backend/src/modules/shares/repository.ts`: 256-bit base64url token generation (`node:crypto` randomBytes(32)); `createLinkShare`/`createUserShares` with dedupe (surface existing grant on partial-unique collision, research.md §1); `listByOwner` + `listByNode` (joined with node id/name/type); `getOwnedShareOrThrow404`; `updateExpiry`; `deleteOwned` (revoke = row delete); `resolveActiveByToken` / `resolveActiveForRecipient` (active = not expired + node live, research.md §4); `resolveSubtreeNodeOrThrow404(share, nodeId)` walking the `parent_id` chain with `owner_id` pinned from the share row and rejecting trashed/foreign/out-of-subtree nodes with uniform `notFound()`; `listSharedWith(userId)`; `deleteExpired(now)`
- [X] T005 Wire `shares: SharesRepository` into the `Services` container in `backend/src/services.ts`
- [X] T006 [P] Add expired-share sweep (`services.shares.deleteExpired(Date.now())`) to the hourly `runAll` in `backend/src/jobs/maintenance.ts`
- [X] T007 Extract owner-agnostic helpers `sendFileContent(reply, storage, ownerId, node, rangeHeader)` (Range parse → 200/206/416, headers) and `sendThumbnail(reply, services, ownerId, node)` into `backend/src/modules/files/stream.ts`; refactor `backend/src/modules/files/content.ts` and `backend/src/modules/files/thumbnail.ts` to call them — owner routes' behavior unchanged (existing `browse`/`upload` integration tests must stay green)
- [X] T008 [P] Add `FileUrlContext` (`{ contentUrl(id), thumbnailUrl(id) }`, default = `api.files.*Url`) in `frontend/src/app/fileUrls.tsx`; consume it instead of direct `api.files` imports in `frontend/src/components/Thumbnail.tsx`, `frontend/src/components/Preview.tsx`, `frontend/src/components/PhotoViewer.tsx`, `frontend/src/components/VideoPlayer.tsx` (owner views behave identically via the default)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Share via an open link (Priority: P1) 🎯 MVP

**Goal**: Owner creates/copies/revokes an unguessable link on any owned file/folder; anyone
with the link views/browses/downloads that subtree anonymously; everything else is a uniform 404.

**Independent Test**: One account + one incognito window (quickstart.md US1): create link →
anonymous view/browse/download works incl. video seek; tampered token/out-of-subtree probes →
uniform 404; revoke kills the link; >60 req/min → 429.

### Tests for User Story 1 (gating — write first, must fail before implementation)

- [X] T009 [P] [US1] Integration test `backend/tests/integration/shares-public.test.ts`: resolve link (file + folder); anonymous children paging; content download incl. `Range`→206 and 416; thumbnail; invalid vs revoked vs expired token byte-identical 404 body; out-of-subtree nodeId → 404; trashed shared root → 404; per-IP rate limit → 429
- [X] T010 [P] [US1] Integration test `backend/tests/integration/shares-manage.test.ts` (link-share parts): `POST /api/shares {kind:'link'}` → 201 with token; repeat create surfaces the SAME grant (no second token); `GET /api/nodes/:id/shares` lists it; `DELETE /api/shares/:id` → 204 and link dead; create/list/revoke against non-owned or nonexistent node/share → uniform 404; unauthenticated management calls → 401

### Implementation for User Story 1

- [X] T011 [US1] Owner share-management routes (create `kind:'link'` incl. optional `expiresAt`, `GET /nodes/:id/shares`, `DELETE /shares/:id`) with Zod validation in `backend/src/modules/shares/routes.ts`
- [X] T012 [US1] Anonymous routes `GET /public/shares/:token`, `/children`, `/files/:nodeId/content`, `/files/:nodeId/thumbnail` in `backend/src/modules/shares/public-routes.ts` — `config: { public: true, rateLimit: { max: 60, timeWindow: '1 minute' } }` (login-route pattern), shared-root DTO with `parentId: null` (research.md §11), streaming via `files/stream.ts` helpers
- [X] T013 [US1] Register `registerShareRoutes` + `registerPublicShareRoutes` in `backend/src/app.ts`
- [X] T014 [P] [US1] API client: `api.shares.create/forNode/revoke` + `api.publicShares.info/children/contentUrl/thumbnailUrl` in `frontend/src/api/client.ts`
- [X] T015 [US1] Query hooks `useNodeShares`, `useCreateShare`, `useRevokeShare`, `usePublicShare`, `usePublicChildren` in `frontend/src/features/shares/hooks.ts`
- [X] T016 [US1] `ShareDialog` (link section: create / show-existing / copy-to-clipboard `${origin}/s/${token}` / revoke) in `frontend/src/components/ShareDialog.tsx`
- [X] T017 [US1] Add "Share…" to the card details (⋮) menu and mount `ShareDialog` in `frontend/src/pages/Browse/index.tsx`
- [X] T018 [US1] Public page `frontend/src/pages/PublicShare/index.tsx` (no AppLayout/auth; `FileUrlContext` provider pointing at public URLs; file → name+preview+Download; folder → reused `FileGrid` + load-more + `Preview` viewers; generic "not available" state on 404) and route `/s/:token` outside `ProtectedRoute` in `frontend/src/app/App.tsx`
- [X] T019 [US1] Share dialog + public page styles (responsive, phone-width) in `frontend/src/styles/global.css`

**Checkpoint**: US1 fully functional — MVP demoable with quickstart.md US1 walkthrough.

---

## Phase 4: User Story 2 — Share directly with other drive users (Priority: P2)

**Goal**: Owner grants named users read access; recipients browse/preview/download via
"Shared with me"; non-recipients see nothing.

**Independent Test**: Two accounts (quickstart.md US2): A shares with B → B sees/reads it;
C probes → 404; A revokes B → gone for B.

### Tests for User Story 2 (gating — write first, must fail before implementation)

- [X] T020 [P] [US2] Integration test `backend/tests/integration/shares-recipient.test.ts`: `POST /api/shares {kind:'user'}` multi-recipient; validation (empty/self/unknown/disabled recipient → 400); dedupe per recipient; `GET /api/shared-with-me` lists grant with owner attribution, omits trashed; `/shared/:shareId/children|content|thumbnail` work for the recipient incl. subfolder navigation and later-added files (FR-011); same calls by a third user or with a link-share id → uniform 404; per-recipient revoke ends access; `GET /api/users` returns active users minus caller, requires session

### Implementation for User Story 2

- [X] T021 [P] [US2] `GET /users` directory route (active users, exclude caller, `{id, username}` only) in `backend/src/modules/users/directory.ts`; register in `backend/src/app.ts`
- [X] T022 [US2] Extend `POST /shares` for `kind:'user'` (recipientIds: exist + active + not caller; per-recipient dedupe; transactional multi-insert) in `backend/src/modules/shares/routes.ts`
- [X] T023 [US2] Recipient routes `GET /shared-with-me`, `GET /shared/:shareId/children`, `/files/:nodeId/content`, `/files/:nodeId/thumbnail` (share resolved by id + `recipient_id = session user`, then subtree-pinned reads; streaming via `files/stream.ts`) in `backend/src/modules/shares/shared-routes.ts`; register in `backend/src/app.ts`
- [X] T024 [P] [US2] API client (`api.users.directory`, `api.sharedWithMe.list/children/contentUrl/thumbnailUrl`, user-kind create) + hooks (`useDirectory`, `useSharedWithMe`, `useSharedChildren`) in `frontend/src/api/client.ts` and `frontend/src/features/shares/hooks.ts`
- [X] T025 [US2] ShareDialog "Specific people" section (directory picker excluding self, current recipients with per-recipient remove) in `frontend/src/components/ShareDialog.tsx`
- [X] T026 [US2] `Shared` page — "Shared with me" list (owner attribution) + share-scoped folder browse/preview using `FileUrlContext` provider — in `frontend/src/pages/Shared/index.tsx`; routes `/shared` and `/shared/:shareId/folder/:nodeId?` in `frontend/src/app/App.tsx`; "Shared" nav link in `frontend/src/app/AppLayout.tsx`

**Checkpoint**: US1 and US2 independently functional.

---

## Phase 5: User Story 3 — Manage my shares in one place (Priority: P3)

**Goal**: Consolidated "My shares" overview (item, kind, recipients, created, expiry) with
copy/revoke/expiry edits; expiry enforced exactly like revocation.

**Independent Test**: Create shares of both kinds (quickstart.md US3): overview lists all;
revoke from list works; 1-minute expiry passes → link answers uniform 404 with no owner action.

### Tests for User Story 3 (gating — write first, must fail before implementation)

- [X] T027 [P] [US3] Extend `backend/tests/integration/shares-manage.test.ts`: `GET /api/shares` returns all kinds with node info, newest first; `PATCH /api/shares/:id` sets/clears expiry, past timestamp → 400, foreign share → 404; expired share → public token AND recipient access 404 before any sweep; `deleteExpired` removes expired rows (maintenance path)

### Implementation for User Story 3

- [X] T028 [US3] `GET /shares` (owner's grants with node info) + `PATCH /shares/:id` (expiry set/clear, future-timestamp validation) in `backend/src/modules/shares/routes.ts`
- [X] T029 [P] [US3] API client `api.shares.list/update` + hooks `useMyShares`, `useUpdateShare` in `frontend/src/api/client.ts` and `frontend/src/features/shares/hooks.ts`
- [X] T030 [US3] "My shares" tab (all grants: item, kind, recipient, created, expiry; copy link; revoke; expiry edit) in `frontend/src/pages/Shared/index.tsx` with route `/shared/manage` in `frontend/src/app/App.tsx`
- [X] T031 [US3] Expiry controls in `frontend/src/components/ShareDialog.tsx` (optional expiry at creation + edit on existing shares, matching the item-panel parity scenario US3 #4)

**Checkpoint**: All user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T032 [P] Isolation & lifecycle suite `backend/tests/integration/isolation-shares.test.ts` (constitution gate): cross-user probing matrix (foreign shareIds/nodeIds/tokens through every share surface → uniform 404, no metadata in bodies); trash → suspended, restore → same link resumes, purge → grants cascade-deleted; recipient-account removal cascades grants; rename/move keeps shares attached (FR-010/011)
- [X] T033 [P] Frontend component test `frontend/tests/ShareDialog.test.tsx` (mocked `api`): create link → URL shown + copy; existing link surfaced (not duplicated); recipients listed with remove; revoke flows
- [X] T034 Full verification: `npm run typecheck` + `npm test` green in `backend/` and `frontend/`
- [X] T035 Execute quickstart.md manual walkthrough (US1–US3 + trash/lifecycle interplay + SC spot checks) against the running dev app

---

## Phase 7: Amendment — email-addressed direct shares (2026-07-15)

**Goal**: Recipients are addressed by email (US2 rework, FR-004/FR-017): accounts carry an
optional owner-managed email; the Share dialog's checkbox picker becomes a type-an-email
resolver over the directory. Grants still bind to account ids.

- [X] T036 Add nullable `users.email` (stored trimmed+lowercased) + partial unique index in `backend/src/db/schema.ts`; migration `backend/src/db/migrations/0004_user_email.ts`
- [X] T037 `normalizeEmail` + `createUser({email?})` + `setEmail` (uniqueness → 409) in `backend/src/modules/users/service.ts`; `toPublicUser` includes `email`
- [X] T038 `PATCH /admin/users/:id { email }` (owner-only) and `email` on create in `backend/src/modules/users/admin.ts`
- [X] T039 Directory + share recipient DTOs carry `{id, username, email}` (explicit re-pick, no row spread) in `backend/src/modules/shares/repository.ts`
- [X] T040 Gating tests: `backend/tests/integration/users-email.test.ts` (create/PATCH/normalize/409/400/403/404, directory + recipient DTO shape) + updated shape assertions in `shares-recipient.test.ts`
- [X] T041 Frontend types/client: `email` on `User`/`DirectoryUser`/`Share.recipient`; `api.admin.createUser(..., email)` + `api.admin.setEmail` in `frontend/src/api/{types,client}.ts`
- [X] T042 ShareDialog people section → type-an-email picker (suggestions filtered by email, username fallback; picked chips; "no user with that email" empty state; recipients labeled by email) in `frontend/src/components/ShareDialog.tsx` + styles in `frontend/src/styles/global.css`
- [X] T043 Admin page: email field on create, email shown per row, "Set email" dialog in `frontend/src/pages/Admin/index.tsx`; "My shares" badge shows recipient email in `frontend/src/pages/Shared/MyShares.tsx`
- [X] T044 Updated ShareDialog tests for the email picker in `frontend/tests/ShareDialog.test.tsx`; full suites + typecheck green in both workspaces

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately. T001 → T002 (migration mirrors schema); T003 independent.
- **Foundational (Phase 2)**: needs Phase 1. T004 needs T001/T002; T005 needs T004; T006 needs T005; T007 backend-independent of T004; T008 frontend-only, needs nothing from backend.
- **US1 (Phase 3)**: needs Phase 2 complete (T011/T012 need T004/T005/T007 + registration T013; frontend T014–T019 need T003/T008).
- **US2 (Phase 4)**: needs Phase 2; extends US1's `routes.ts`/`ShareDialog.tsx` files, so run after Phase 3 (sequential single-developer order).
- **US3 (Phase 5)**: needs Phase 2; touches the same files as US1/US2 — run after Phase 4.
- **Polish (Phase 6)**: after desired stories complete.

### Within Each User Story

- Tests first (T009/T010, T020, T027) and confirm they FAIL before implementing.
- Backend routes before frontend pages that call them; `app.ts` registration immediately after the route module exists.

### Parallel Opportunities

- Phase 1: T003 ∥ T001–T002. Phase 2: T006, T007, T008 mutually parallel once T004/T005 land (T007/T008 even earlier).
- Each story's test task(s) [P] can be written in parallel with each other and before implementation.
- Backend/frontend splits inside a story (e.g. T012 ∥ T014, T021 ∥ T024) are parallel-safe — different files.

---

## Parallel Example: User Story 1

```bash
# Write both gating test files together (before implementation):
Task: "shares-public.test.ts anonymous access + uniformity + rate limit"
Task: "shares-manage.test.ts link create/dedupe/revoke + uniform 404"

# Then implement backend and frontend API surface in parallel:
Task: "public-routes.ts anonymous share routes"        # backend
Task: "api client shares/publicShares sections"        # frontend
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (foundation).
2. Phase 3 (open link) → run quickstart US1 walkthrough → demoable MVP.

### Incremental Delivery

1. Foundation → US1 (link sharing, MVP) → US2 (shared-with-me) → US3 (manage view) — each
   checkpoint leaves the app releasable.
2. Phase 6 gates the feature branch: isolation suite + full test/typecheck + quickstart run
   before the PR.

## Notes

- Single `shares` table serves all three stories; no schema changes after Phase 1.
- `routes.ts`, `ShareDialog.tsx`, `hooks.ts`, `client.ts`, `App.tsx` are shared files across
  stories — the sequential story order above avoids same-file conflicts.
- Revoke = DELETE row; never add a status column (research.md §2).
- Never widen `NodeRepository`; all share reads go through `SharesRepository` (research.md §4).
