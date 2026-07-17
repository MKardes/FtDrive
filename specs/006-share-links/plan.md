# Implementation Plan: File & Folder Sharing (Direct User Shares + Open Links)

**Branch**: `006-share-links` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-share-links/spec.md`

## Summary

Add read-only sharing of files and folders: (a) **open-link shares** — an unguessable
capability URL (`/s/<token>`) that lets anyone with the link view/preview/download the shared
file or browse the shared folder's subtree without an account; and (b) **direct shares** — grants
to named users of the same instance, surfaced in a "Shared with me" area. Owners manage
(list, set expiry, revoke) all their shares from the item and from a consolidated view.

Technical approach: one new `shares` table (one row per grant; link shares carry a 256-bit
random token, direct shares carry a recipient id; revoke = row delete, so revoked and
never-existed are indistinguishable by construction). All share access resolves the share row
first — the share pins `owner_id` and the shared root — then every node lookup is filtered by
that owner **and** verified to sit inside the shared subtree, preserving the Principle II
choke-point pattern. The existing owner-scoped `/files/:id/content` range-streaming logic is
extracted into a shared helper reused by recipient- and link-scoped content routes. Anonymous
routes are the existing `config: { public: true }` + per-route `rateLimit` pattern the login
route already uses. Frontend adds a Share dialog on each card's details (⋮) menu, a
`/shared` area (Shared-with-me + My-shares tabs), and an unauthenticated `/s/:token` page; the
existing `Thumbnail`/`Preview` components are reused by threading content/thumbnail URL
builders through a small React context instead of hard-importing the owner API URLs.

## Technical Context

**Language/Version**: TypeScript 5.7 · Node.js 22 (backend), React 18 (frontend)

**Primary Dependencies**: Fastify 5 (`@fastify/cookie`, `@fastify/rate-limit`, `@fastify/static`),
Drizzle ORM + better-sqlite3, Zod; React 18 + Vite + TanStack Query + react-router. **No new
dependency** — link tokens come from `node:crypto` `randomBytes`.

**Storage**: existing SQLite database; one new `shares` table (migration `0003_shares`). No
changes to blob storage layout.

**Testing**: Vitest — backend integration tests against the built Fastify app (pattern:
`backend/tests/integration/*.test.ts` incl. the `isolation-*` suites), frontend component tests
with Testing Library (`frontend/tests/*.test.tsx`).

**Target Platform**: self-hosted Linux server (single deployable in production; API + Vite dev
servers in development), web UI on desktop + phone browsers.

**Project Type**: web application — existing `backend/` + `frontend/` workspaces.

**Performance Goals**: share resolution adds ≤ 2 indexed SQLite lookups per request; anonymous
folder listing paginates with the existing keyset cursors (no full-folder loads); revocation is
effective on the next request (no caching of share validity).

**Constraints**: no anonymous write path; link tokens ≥ 256 bits entropy; public routes
rate-limited per IP; uniform 404 for missing/foreign/revoked/expired everywhere; share access
must never widen the owner-scoped `NodeRepository` (share scope lives in a separate,
share-pinned repository).

**Scale/Scope**: household/small-team instance (≤ ~20 users); tens–hundreds of shares; shared
folders up to tens of thousands of nodes (already handled by keyset pagination).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Assessment |
|---|-----------|------------|
| I | Security & Authentication First | **PASS with one justified exception.** Every new route except `GET /api/public/shares/:token*` requires the existing session guard. The public routes are a deliberate, owner-granted **capability-URL** exception (spec Assumptions): authorization is the 256-bit random token itself; routes are read-only (GET), rate-limited per IP (same `config.rateLimit` mechanism as login), return uniform 404 for invalid/revoked/expired tokens, and disclose nothing outside the shared subtree. Justified in Complexity Tracking. Secrets: none added; tokens are generated server-side via `crypto.randomBytes(32)` and are revocable rows, consistent with how session ids are already stored. |
| II | Strict Per-User Data Isolation | **PASS.** Share-scoped reads never trust client identifiers for ownership: the share row is resolved first (by token, or by id + authenticated recipient), which pins `owner_id` and the shared root; every subsequent node query filters by that `owner_id` AND verifies subtree membership via the parent chain. Owner share-management queries are filtered by the authenticated owner. All failure modes (missing, foreign, revoked, expired, out-of-subtree, trashed) return the same 404. Gating isolation tests are planned (`shares` additions to the isolation suites). Recipient-picker user directory exposes usernames only (spec assumption) — no file data, counts, or metadata. |
| III | Self-Hosted Data Ownership | **PASS.** No external services; links are relative to the owner's own origin; tokens generated locally. |
| IV | Media-First, Intuitive UI | **PASS.** Share pages reuse the existing grid/thumbnail/preview components (lazy thumbnails, keyset "load more", photo/video viewers), responsive on phone-width screens; Share action lives on the existing card details menu. |
| V | Reliable Sync & Data Integrity | **PASS.** Sharing is read-only; no new write/destructive surface for recipients or visitors. Trash keeps its semantics: trashed ⇒ share access suspended, restore ⇒ resumes, permanent purge ⇒ grants cascade-deleted. |

**Post-design re-check (after Phase 1)**: PASS — design artifacts introduce no additional
deviations; the single Principle-I exception is recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/006-share-links/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — decisions verified against current code
├── data-model.md        # Phase 1 output — shares table + DTOs + state rules
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/
│   └── openapi.yaml     # Phase 1 output — new/changed API surface
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db/
│   │   ├── schema.ts                    # + shares table
│   │   └── migrations/0003_shares.ts    # + migration (append to migrations/index.ts)
│   ├── modules/
│   │   ├── shares/
│   │   │   ├── repository.ts            # SharesRepository — share-pinned data access
│   │   │   ├── routes.ts                # owner management: POST/GET/PATCH/DELETE /shares, GET /nodes/:id/shares
│   │   │   ├── shared-routes.ts         # recipient: GET /shared-with-me, /shared/:shareId/*
│   │   │   └── public-routes.ts         # anonymous: GET /public/shares/:token* (public + rate-limited)
│   │   ├── files/
│   │   │   ├── stream.ts                # extracted range-parse + content/thumbnail send helpers
│   │   │   ├── content.ts               # refactored to use stream.ts (behavior unchanged)
│   │   │   └── thumbnail.ts             # refactored to use stream.ts (behavior unchanged)
│   │   └── users/
│   │       └── directory.ts             # GET /users — id+username of active users (any session)
│   ├── jobs/maintenance.ts              # + expired-share sweep
│   ├── services.ts                      # + shares repository in the container
│   └── app.ts                           # + route registrations
└── tests/integration/
    ├── shares-manage.test.ts            # create/dedupe/list/expiry/revoke + uniform 404
    ├── shares-public.test.ts            # anonymous link access, subtree guard, rate limit, ranges
    ├── shares-recipient.test.ts         # shared-with-me + share-scoped browse/read
    └── isolation-shares.test.ts         # cross-user probing, trash interplay, cascade cleanup

frontend/
├── src/
│   ├── api/client.ts                    # + shares/sharedWithMe/publicShares/users sections
│   ├── api/types.ts                     # + Share, SharedWithMeItem, PublicShareInfo, DirectoryUser
│   ├── app/App.tsx                      # + routes: /s/:token (public), /shared, /shared/manage, /shared/:shareId/folder/:nodeId?
│   ├── app/AppLayout.tsx                # + "Shared" nav link
│   ├── app/fileUrls.tsx                 # FileUrlContext {contentUrl, thumbnailUrl} (default: owner API)
│   ├── components/
│   │   ├── Thumbnail.tsx                # reads URL builder from FileUrlContext
│   │   ├── Preview.tsx                  # reads URL builder from FileUrlContext (+ PhotoViewer/VideoPlayer)
│   │   └── ShareDialog.tsx              # link + people management for one node
│   ├── features/shares/hooks.ts         # TanStack Query hooks (my shares, node shares, shared-with-me, share browse, mutations)
│   └── pages/
│       ├── Shared/index.tsx             # tabs: Shared with me / My shares (+ share-scoped browse)
│       └── PublicShare/index.tsx        # /s/:token — file preview/download or folder browse
└── tests/
    └── ShareDialog.test.tsx             # dialog: create/copy/revoke link, recipients
```

**Structure Decision**: unchanged two-workspace web app (`backend/` + `frontend/`). New backend
surface is one module (`modules/shares/`) plus one small refactor (`files/stream.ts`) so
owner-, recipient-, and link-scoped content streaming share one implementation. Frontend adds
two pages, one dialog, one context; existing grid/viewer components are reused, not forked.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Anonymous (unauthenticated) read path `GET /api/public/shares/:token*` deviates from Principle I's "no anonymous data paths" | The feature's core requirement (spec US1/FR-002): recipients without accounts must view/download via a link. The unguessable 256-bit token **is** the credential — a revocable, owner-granted capability scoped to exactly one subtree, read-only, rate-limited, uniform-404 on any failure | (a) Requiring accounts for all recipients defeats the user's explicit "without an account" requirement. (b) Short-lived signed URLs would break "the link keeps working until revoked/expired" sharing semantics and add key-management complexity for no isolation gain |
