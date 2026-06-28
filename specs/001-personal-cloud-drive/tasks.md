---
description: "Task list for FtDrive — Personal Cloud Drive Web Application"
---

# Tasks: FtDrive — Personal Cloud Drive Web Application

**Input**: Design documents from `/specs/001-personal-cloud-drive/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Test tasks ARE included. The project constitution makes authentication (Principle I) and
per-user isolation (Principle II) **gating**, requiring negative tests before merge; research §15
defines the Vitest + Playwright strategy. Isolation/auth tests below are non-negotiable; broader
unit/E2E tests follow the same strategy.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3, US4)
- Every task lists an exact file path

## Path Conventions

Web application layout (plan.md): `backend/src/`, `backend/tests/`, `frontend/src/`,
`frontend/tests/`, `e2e/tests/`. Paths below follow that structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the monorepo, toolchains, and scripts.

- [X] T001 Create the repository workspace structure (`backend/`, `frontend/`, `e2e/`) and a root `package.json` with workspaces per plan.md
- [X] T002 [P] Initialize the backend TypeScript/Fastify project: `backend/package.json` (Fastify, `@fastify/multipart`, `@fastify/static`, `@fastify/rate-limit`, `@fastify/cookie`, Drizzle, `better-sqlite3`, `argon2`, `zod`, `sharp`, `pino`), `backend/tsconfig.json` (ESM, Node 22)
- [X] T003 [P] Initialize the frontend React+Vite project: `frontend/package.json` (React 18, Vite, TanStack Query, React Router), `frontend/vite.config.ts` (dev proxy `/api`→backend), `frontend/tsconfig.json`, `frontend/index.html`
- [X] T004 [P] Initialize the Playwright E2E project: `e2e/package.json` and `e2e/playwright.config.ts` with desktop and 360 px mobile viewport projects
- [X] T005 [P] Configure shared ESLint + Prettier at repo root (`.eslintrc.cjs`, `.prettierrc`) for backend and frontend
- [X] T006 [P] Configure Vitest for backend (`backend/vitest.config.ts`) and frontend (`frontend/vitest.config.ts`)
- [X] T007 Add root npm scripts in `package.json` (`dev:backend`, `dev:frontend`, `build`, `start`, `test`, `test:e2e`, `db:migrate`, `create-owner`) per quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on — especially the security and
isolation choke points (Principles I & II).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T008 Implement env config loading + zod validation (fail-fast) in `backend/src/config/index.ts`: `DATA_ROOT`, `DATABASE_PATH`, `SESSION_SECRET`, `TRUST_PROXY`, `MAX_UPLOAD_BYTES` (default 5 GB), `TRASH_RETENTION_DAYS` (default 30), `OWNER_BOOTSTRAP_*`
- [ ] T009 Implement the SQLite connection (`better-sqlite3`, WAL mode) in `backend/src/db/client.ts`
- [ ] T010 Define the Drizzle schema (`users`, `sessions`, `nodes`, `login_throttle`) with indexes and `PARTIAL UNIQUE (owner_id, parent_id, name) WHERE trashed_at IS NULL` in `backend/src/db/schema.ts` per data-model.md
- [ ] T011 Generate the initial Drizzle migration in `backend/src/db/migrations/` and wire the `db:migrate` runner in `backend/src/db/migrate.ts`
- [ ] T012 [P] Implement ULID id generation, `AppError`/uniform-404 error types, and the keyset pagination helper (order `type DESC, name ASC, id`; opaque cursor) in `backend/src/lib/`
- [ ] T013 [P] Implement structured logging (`pino`, no secrets/contents) and the global error handler (maps to uniform `404 NOT_FOUND`, hides existence) in `backend/src/middleware/`
- [ ] T014 Implement the owner-scoped node data-access layer (every query filtered by `owner_id`; `getOwnedNodeOrThrow404()` resolver re-checks ownership) in `backend/src/modules/nodes/repository.ts` — **isolation choke point (Principle II)**
- [ ] T015 [P] Implement Argon2id password hashing + verify in `backend/src/auth/password.ts`
- [ ] T016 Implement the server-side session store (create, validate `revoked_at IS NULL AND expires_at > now`, revoke, expiry) in `backend/src/auth/sessions.ts`
- [ ] T017 Implement the global auth `preHandler` guard (default deny) + authenticated-user request context in `backend/src/auth/guard.ts`
- [ ] T018 [P] Implement persisted login throttle (per-account + per-IP progressive back-off, no permanent lockout, uniform/non-enumerating) in `backend/src/auth/throttle.ts`
- [ ] T019 [P] Implement per-user storage paths, path-traversal-safe resolution confined to the user root, and atomic write/move (temp→fsync→rename) + temp-sweep in `backend/src/storage/index.ts`
- [ ] T020 Implement the Fastify app factory (register cookie, rate-limit, multipart, static, error handler, **global auth guard**, route mounting) in `backend/src/app.ts` and the process entry in `backend/src/index.ts`
- [ ] T021 Implement the one-time owner bootstrap CLI (`create-owner`, no public signup) in `backend/src/cli/create-owner.ts`
- [ ] T022 [P] Implement the frontend typed API client (fetch with credentials, error mapping, shared request/response types) in `frontend/src/api/`
- [ ] T023 [P] Implement the frontend app shell (React Router, TanStack Query provider, auth boundary/route guard, mobile-first base styles) in `frontend/src/app/` and `frontend/src/main.tsx`
- [ ] T024 [P] Create the backend test harness + fixtures (in-memory/temp SQLite, provision users, seed nodes/blobs, Fastify `inject` helpers) in `backend/tests/fixtures/`

**Checkpoint**: Foundation ready — auth, isolation layer, storage, and app shell exist. User stories can now begin.

---

## Phase 3: User Story 1 - Sign in and browse my private files and media (Priority: P1) 🎯 MVP

**Goal**: An authenticated user browses their private folder/file tree on desktop or phone, sees
image/video thumbnails, opens photos full-screen, plays videos, and searches by name — with
unauthenticated visitors seeing nothing.

**Independent Test**: Provision a user with folders, images, and videos; verify sign-in is required,
the hierarchy is navigable with thumbnails, photos open full-screen, videos play (range seek),
name search returns only the user's items, and an anonymous visitor gets no content or metadata.

### Tests for User Story 1 (gating subset: auth + isolation)

- [ ] T025 [P] [US1] Integration tests for auth (login success, uniform 401 for wrong-password vs unknown-user, `/auth/me`, logout, session expiry/revocation, login throttling/429) in `backend/tests/integration/auth.test.ts`
- [ ] T026 [P] [US1] Integration tests for browse/search/content-range/thumbnail incl. anonymous-denied (FR-001) in `backend/tests/integration/browse.test.ts`
- [ ] T027 [P] [US1] **Isolation negative tests** — user A cannot list/read/stream/thumbnail/search user B's nodes; id-guessing returns uniform 404 (FR-009/010, SC-002) in `backend/tests/integration/isolation-browse.test.ts`

### Implementation for User Story 1

- [ ] T028 [US1] Auth routes `POST /auth/login` (throttle check, uniform errors, set HttpOnly/Secure/SameSite cookie), `POST /auth/logout`, `GET /auth/me` in `backend/src/modules/auth/routes.ts`
- [ ] T029 [US1] `GET /folders/{id}/children` keyset-paginated listing (with `root` alias) in `backend/src/modules/nodes/routes.ts`
- [ ] T030 [US1] `GET /search` owner-scoped case-insensitive name `LIKE`, paginated (FR-021) in `backend/src/modules/nodes/search.ts`
- [ ] T031 [US1] `GET /files/{id}/content` streaming with HTTP Range (`Accept-Ranges`/`Content-Range`/206) for video seek and download in `backend/src/modules/files/content.ts`
- [ ] T032 [P] [US1] Media layer: image thumbnails via `sharp` (EXIF-aware) and video posters via spawned `ffmpeg` (graceful degrade → `unsupported`), cached under per-user `thumbs/` in `backend/src/media/`
- [ ] T033 [US1] `GET /files/{id}/thumbnail` (ownership-checked, on-demand generate+cache via media layer) in `backend/src/modules/files/thumbnail.ts`
- [ ] T034 [P] [US1] Frontend Login page + auth hooks (sign-in, session-expiry redirect) in `frontend/src/pages/Login/` and `frontend/src/features/auth/`
- [ ] T035 [US1] Frontend Browse page: `FileGrid` + `Thumbnail` (lazy via `IntersectionObserver`) + breadcrumb navigation + loading/error states in `frontend/src/pages/Browse/` and `frontend/src/components/`
- [ ] T036 [US1] Frontend `PhotoViewer` (full-screen) and `VideoPlayer` (range playback) + unsupported-type download fallback in `frontend/src/components/`
- [ ] T037 [US1] Frontend name-search UI + results view in `frontend/src/features/search/`
- [ ] T038 [P] [US1] E2E: sign-in gate, browse, photo preview, video playback, search — desktop + 360 px in `e2e/tests/us1-browse.spec.ts`
- [ ] T039 [P] [US1] Frontend component tests (`FileGrid`, `Thumbnail`, `PhotoViewer`, `VideoPlayer`) in `frontend/tests/`

**Checkpoint**: User Story 1 (MVP) is fully functional and independently testable.

---

## Phase 4: User Story 2 - Upload and download files from any device (Priority: P2)

**Goal**: A signed-in user uploads one or more files (including phone photos/videos) into a folder
with crash-safe atomic writes and "keep both" collision handling, and downloads any file byte-for-byte.

**Independent Test**: Upload files (incl. from a phone viewport) → they appear with correct names and
thumbnails within ~10 s; interrupt an upload → no partial/corrupt file remains; download → byte-identical;
upload a duplicate name → both kept.

### Tests for User Story 2

- [ ] T040 [P] [US2] Integration tests: multipart upload → atomic commit, download byte-identity, name-collision keep-both (FR-013), size-limit 413, and concurrent same-user uploads into one folder don't corrupt the listing (Edge Case: concurrent edits) in `backend/tests/integration/upload.test.ts`
- [ ] T041 [P] [US2] Integration test: interrupted upload leaves no partial/corrupt blob and discards temp (FR-014, SC-008) in `backend/tests/integration/upload-crash.test.ts`
- [ ] T042 [P] [US2] **Isolation negative tests**: user A cannot upload into / download from user B's nodes (uniform 404) in `backend/tests/integration/isolation-files.test.ts`
- [ ] T043 [P] [US2] Frontend component test for `Uploader` (multi-file, progress, error) in `frontend/tests/uploader.test.tsx`

### Implementation for User Story 2

- [ ] T044 [US2] `POST /files` multipart: stream→temp→fsync→atomic rename→DB commit, enforce `MAX_UPLOAD_BYTES`, keep-both collision suffixing in `backend/src/modules/files/upload.ts`
- [ ] T045 [US2] On-upload thumbnail/poster generation trigger + `thumb_status` lifecycle (`pending`→`ready`/`unsupported`) reusing the media layer in `backend/src/modules/files/upload.ts`
- [ ] T046 [P] [US2] Frontend `Uploader` component (multi-file select, phone camera capture, progress, error/retry) in `frontend/src/components/Uploader/` and `frontend/src/features/upload/`
- [ ] T047 [US2] Frontend download action (uses `GET /files/{id}/content`) + post-upload list refresh + "kept both" feedback in `frontend/src/features/upload/`
- [ ] T048 [P] [US2] E2E: upload (incl. mobile viewport), download identity, name-collision keep-both in `e2e/tests/us2-upload.spec.ts`

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 4 - Keep every user's data fully private (Priority: P2)

**Goal**: The owner provisions/removes accounts and resets passwords; users change their own
password; every cross-user access attempt fails uniformly. (Core isolation already enforced in the
Foundational data-access layer; this story delivers the multi-user surface and consolidated proof.)

**Independent Test**: Provision users A and B via the owner; as A attempt to view/list/download/
move/delete/search B's items (including by guessing ids) → every attempt returns a uniform 404
revealing nothing; owner provisioning/removal affects only that user's space.

### Tests for User Story 4 (gating: consolidated isolation)

- [ ] T049 [P] [US4] Integration tests: admin list/provision/remove (owner-only → 403 for non-owner), removal cascades nodes+sessions+disk root, password-reset revokes sessions (FR-015/022) in `backend/tests/integration/admin.test.ts`
- [ ] T050 [P] [US4] Integration tests: self password change requires current password, revokes other sessions (FR-022) in `backend/tests/integration/account.test.ts`
- [ ] T051 [P] [US4] **Consolidated cross-user isolation suite**: provision A+B, id-guess across every endpoint built so far → uniform 404, no existence/count/timing disclosure (FR-010, SC-002) in `backend/tests/integration/isolation-suite.test.ts`

### Implementation for User Story 4

- [ ] T052 [US4] Owner-role authorization guard (`403` for non-owner) in `backend/src/auth/roles.ts`
- [ ] T053 [US4] Admin routes `GET/POST /admin/users`, `DELETE /admin/users/{id}` (cascade nodes, sessions, on-disk root), `POST /admin/users/{id}/password-reset` (revoke user sessions) in `backend/src/modules/users/admin.ts`
- [ ] T054 [US4] `POST /account/password` (verify current, set new ≥10, revoke other sessions) in `backend/src/modules/users/account.ts`
- [ ] T055 [P] [US4] Frontend Admin (users) page — list/provision/remove/reset in `frontend/src/pages/Admin/`
- [ ] T056 [P] [US4] Frontend Account/Settings page — change own password in `frontend/src/pages/Account/`
- [ ] T057 [P] [US4] E2E: owner provisions 2 users; confirm cross-user isolation + admin/account flows (desktop + mobile) in `e2e/tests/us4-isolation.spec.ts`

**Checkpoint**: Multi-user privacy proven end-to-end; safe to use with more than one person.

---

## Phase 6: User Story 3 - Organize my library (Priority: P3)

**Goal**: A signed-in user creates folders; renames and moves items (cycle-safe, collision-safe);
deletes to a recoverable trash with confirmation; restores within the retention window.

**Independent Test**: Create a folder; rename a file; move it into the folder; delete a file → it
goes to trash; restore it → returns to original location; delete a non-empty folder → confirmation
required and contents recover together.

### Tests for User Story 3

- [ ] T058 [P] [US3] Integration tests: create folder, rename, move (reject cycle → 409, destination must be owned folder, collision keep-both), and concurrent same-user rename/move into one folder stays consistent under the partial-unique index (Edge Case: concurrent edits) in `backend/tests/integration/organize.test.ts`
- [ ] T059 [P] [US3] Integration tests: delete→trash subtree, restore to original (or root) with collision handling, purge/empty require confirm, retention sweep (FR-007/008, SC-009) in `backend/tests/integration/trash.test.ts`
- [ ] T060 [P] [US3] **Isolation negative tests**: user A cannot create-under/rename/move/delete/restore/purge user B's nodes (uniform 404) in `backend/tests/integration/isolation-organize.test.ts`

### Implementation for User Story 3

- [ ] T061 [US3] `POST /folders` create folder (collision keep-both) in `backend/src/modules/nodes/routes.ts`
- [ ] T062 [US3] `PATCH /nodes/{id}` rename and/or move (destination owned folder, cycle check, collision keep-both → 409) in `backend/src/modules/nodes/routes.ts`
- [ ] T063 [US3] `DELETE /nodes/{id}` move-to-trash (set `trashed_at`/`trashed_expires_at`/`original_parent_id`; trash subtree together) in `backend/src/modules/trash/routes.ts`
- [ ] T064 [US3] Trash routes `GET /trash`, `POST /trash/{id}/restore`, `DELETE /trash/{id}?confirm`, `DELETE /trash?confirm` (purge removes rows + blobs + thumbs) in `backend/src/modules/trash/routes.ts`
- [ ] T065 [US3] Retention sweep job: permanently remove nodes with `trashed_expires_at < now` (+ blobs/thumbs) in `backend/src/modules/trash/sweep.ts`
- [ ] T066 [P] [US3] Frontend create-folder / rename / move UI + destructive-action confirm dialogs in `frontend/src/features/nodes/`
- [ ] T067 [P] [US3] Frontend Trash page (list, restore, purge, empty-with-confirm) in `frontend/src/pages/Trash/`
- [ ] T068 [P] [US3] E2E: organize + trash recovery + non-empty-folder confirm (desktop + mobile) in `e2e/tests/us3-organize.spec.ts`

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Production readiness and cross-story hardening.

- [ ] T069 [P] Wire orphan temp-file sweep + retention sweep into a scheduled job on startup in `backend/src/index.ts`
- [ ] T070 [P] Production single-deployable: backend serves the built SPA via `@fastify/static` + SPA fallback; verify `build`/`start` in `backend/src/app.ts`
- [ ] T071 [P] Security hardening pass: cookie flags (`HttpOnly`/`Secure`/`SameSite`), `TRUST_PROXY`/`X-Forwarded-*` handling, security headers, rate-limit tuning in `backend/src/app.ts`
- [ ] T072 [P] Audit-logging review: ensure login/failed-login/denied/revoke events are logged without secrets or file contents across `backend/src/`
- [ ] T073 [P] Performance validation: SC-006 (1,000+ items first content < 2 s via keyset + lazy thumbs), SC-004 (phone-photo thumb < 10 s), and SC-003 (locate via name search + open a photo/video < 30 s on a 360 px viewport) in `e2e/tests/performance.spec.ts`
- [ ] T074 [P] Documentation: deployment guide (Caddy/TLS, at-rest encryption, least-privilege service user, **`ffmpeg` system-binary prerequisite** + optional startup presence check) and README in `docs/`
- [ ] T075 Run the quickstart.md validation end-to-end (US1–US4 + 360 px responsive) and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phases 3–6)**: All depend on Foundational. Recommended priority order
  **US1 (P1) → US2 (P2) → US4 (P2) → US3 (P3)**; once Foundational is done they can also proceed in
  parallel by different developers (see independence notes below).
- **Polish (Phase 7)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Only Foundational. No dependency on other stories. (MVP)
- **US2 (P2)**: Only Foundational. Reuses the US1 `GET /files/{id}/content` endpoint for download but
  is independently testable (its tests provision their own fixtures).
- **US4 (P2)**: Only Foundational for its admin/account surface. Its consolidated isolation suite
  (T051) asserts against whatever endpoints exist; richest when run after US1/US2 (and re-run after US3).
- **US3 (P3)**: Only Foundational. Independent of US1/US2/US4.

### Within Each User Story

- Gating tests (auth/isolation) are written first and must FAIL before implementation.
- Models/data-access (Foundational) → routes/services → frontend → E2E.
- Story complete and independently testable before moving to the next priority.

### Parallel Opportunities

- Setup: T002–T006 in parallel.
- Foundational: T012, T013, T015, T018, T019 in parallel; then T022, T023, T024 in parallel (T014/T016/T017/T020 are sequential choke points after T010/T011).
- Once Foundational completes, US1/US2/US4/US3 can be staffed in parallel.
- Within a story, all `[P]` test files and independent frontend/E2E files run in parallel.

---

## Parallel Example: User Story 1

```bash
# Gating tests first (different files, write before implementation):
Task: "Auth integration tests in backend/tests/integration/auth.test.ts"            # T025
Task: "Browse integration tests in backend/tests/integration/browse.test.ts"        # T026
Task: "Isolation negative tests in backend/tests/integration/isolation-browse.test.ts"  # T027

# Then parallel implementation pieces:
Task: "Media layer (sharp/ffmpeg) in backend/src/media/"                            # T032
Task: "Login page + auth hooks in frontend/src/pages/Login/"                        # T034
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRITICAL — establishes auth + isolation choke points).
3. Phase 3: User Story 1.
4. **STOP and VALIDATE**: anonymous denied; browse/preview/search work; isolation holds.
5. Deploy/demo the private media browser.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate → deploy (MVP).
3. US2 (upload/download) → validate → deploy.
4. US4 (multi-user privacy) → validate → **safe for multiple users**.
5. US3 (organize/trash) → validate → deploy.
6. Phase 7 polish → production hardening.

### Parallel Team Strategy

After Foundational: Dev A → US1, Dev B → US2, Dev C → US4, Dev D → US3. Re-run US4's consolidated
isolation suite (T051) once every story's endpoints exist.

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks.
- `[Story]` labels map tasks to spec.md user stories for traceability (US3 is sequenced last as P3).
- Auth (Principle I) and isolation (Principle II) tests are **gating** and must pass before merge.
- Atomic temp→fsync→rename writes and uniform-404 isolation are enforced in shared choke points
  (`storage/`, `modules/nodes/repository.ts`) so every story inherits them.
- Commit after each task or logical group; land via PR into `main` per CLAUDE.md.
