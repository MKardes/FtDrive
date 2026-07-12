# FtDrive — Project Working Agreements

## Git & Branching (REQUIRED)

- **Never commit or push directly to `main`.** `main` is updated only by merging a reviewed Pull
  Request.
- Do all work on a **feature branch** named `feat/<short-description>` (e.g.,
  `feat/001-personal-cloud-drive`). Branch off the latest `main`.
- Land changes by opening a **PR** from the feature branch into `main` and merging it there.
- Follow the harness rules: only commit/push when explicitly asked; end commit messages with the
  required `Co-Authored-By` trailer and PR bodies with the Claude Code attribution line.

<!-- SPECKIT START -->
## Active feature: Per-Item Details Menu & Bulk Selection (`005-actions-menu-bulk-select`)

Replace each file/folder card's always-visible Rename/Move/Delete buttons with a single "details"
(⋮) menu, keeping Download as a separate quick action; add a toolbar "Select" mode so users can
check multiple cards and apply bulk Move/Delete to all of them at once, with per-item
partial-failure reporting. For design and constraints, read the current plan and its companion
artifacts:

- Plan: `specs/005-actions-menu-bulk-select/plan.md`
- Spec: `specs/005-actions-menu-bulk-select/spec.md`
- Research (structural findings + decisions, verified against current code): `specs/005-actions-menu-bulk-select/research.md`
- Data model (transient view-state only — no new entities): `specs/005-actions-menu-bulk-select/data-model.md`
- Quickstart/validation: `specs/005-actions-menu-bulk-select/quickstart.md`

Builds on `001-personal-cloud-drive` through `004-ui-polish-viewer`; this feature is
**frontend-only** — no new backend endpoints, tables, or contracts.

**Stack**: unchanged feature-001 stack (TypeScript · React 18 + Vite · TanStack Query). No new
dependency: bulk actions loop the existing single-item `PATCH`/`DELETE /nodes/:id` endpoints via
`Promise.allSettled` instead of adding a bulk endpoint; the details-menu popover uses the same
plain-CSS sibling-popover approach `.upload-list` already established in `004-ui-polish-viewer`,
no portal/library. `.file-card` changes from a `<button>` to a `<div role="button" tabIndex={0}>`
(with matching keydown handling) since a real `<button>` cannot legally host the nested ⋮/checkbox
controls this feature needs. `MoveDialog` generalizes from a single `node` to a `nodes: Node[]`
list so single- and bulk-move share one folder picker. **Non-negotiables** (project constitution)
inherited unchanged since no new server surface is added: every bulk action is the same
already-authenticated, already-isolated per-item endpoint, just called once per selected item;
Rename/Move/Delete/Download behave exactly as they do today — only how they're reached changes;
bulk Delete still routes through Trash, never a permanent delete.

## Prior feature: UI Layout Polish & Viewer Enhancement (`004-ui-polish-viewer`)

Fixed two confirmed overlap defects (file/folder cards colliding in the browse grid when names
are long; carousel nav controls sitting on top of full-screen photo/video content), tidied up the
upload-progress list's spacing, and improved the video viewer's use of screen space and
set-position awareness. For design and constraints, read its plan and companion artifacts:

- Plan: `specs/004-ui-polish-viewer/plan.md`
- Spec: `specs/004-ui-polish-viewer/spec.md`
- Research (root-cause findings, verified live against the running app): `specs/004-ui-polish-viewer/research.md`
- Data model (transient view-state only — no new entities): `specs/004-ui-polish-viewer/data-model.md`
- Quickstart/validation: `specs/004-ui-polish-viewer/quickstart.md`

Builds on `001-personal-cloud-drive`, `002-url-video-download`, and `003-drag-drop-carousel-nav`;
this feature is **frontend-only** (CSS/markup + one threaded-through view-state field) — no new
backend endpoints, tables, or contracts.

**Stack**: unchanged feature-001 stack (TypeScript · React 18 + Vite). No new dependency: fixes
land in `frontend/src/styles/global.css` (card sizing, upload-row spacing, viewer backdrop
opacity, media min-size, nav-button gutter) plus a `position` field threaded through the existing
`PreviewNavProps` (`Preview.tsx` → `PhotoViewer.tsx`/`VideoPlayer.tsx`), computed in `Browse` from
the `previewIndex`/`items` state feature 003 already maintains. **Non-negotiables** (project
constitution) inherited unchanged since no new server surface is added: every fix renders data
the already-authenticated, already-isolated listing/upload calls returned; no existing capability
(upload, download, rename, move, delete, search, navigation, trash, carousel nav) is altered — only
layout/presentation.

## Prior feature: Drag-and-Drop Uploads & Media Carousel Navigation (`003-drag-drop-carousel-nav`)

Drop files from the OS directly onto the folder view to upload them (reusing the existing
click-to-upload pipeline), and step left/right through a folder's (or search results') files from
inside the full-screen photo/video viewer instead of closing it to pick the next item. For design
and constraints, read the current plan and its companion artifacts:

- Plan: `specs/003-drag-drop-carousel-nav/plan.md`
- Spec: `specs/003-drag-drop-carousel-nav/spec.md`
- Research (decisions + rationale): `specs/003-drag-drop-carousel-nav/research.md`
- Data model (transient view-state only — no new entities): `specs/003-drag-drop-carousel-nav/data-model.md`
- Quickstart/validation: `specs/003-drag-drop-carousel-nav/quickstart.md`

Builds on `001-personal-cloud-drive` (core app) and `002-url-video-download`; this feature is
**frontend-only** — no new backend endpoints, tables, or contracts.

**Stack**: unchanged feature-001 stack (TypeScript · React 18 + Vite · TanStack Query). Adds no new
dependency: drag-and-drop uses the native HTML5 Drag and Drop API wired into the existing
`useUploader().add()` upload pipeline; carousel navigation indexes into the `items` array already
produced by the existing `useChildren`/`useSearch` paginated queries and extends the existing
per-viewer Escape-key listener with ArrowLeft/ArrowRight. **Non-negotiables** (project
constitution) inherited unchanged since no new server surface is added: every upload still goes
through the existing authenticated, per-user-scoped endpoint; navigation only reads data the
already-isolated listing endpoints returned; no wrap-around navigation; drop is inert while
searching or while a dialog is open.

## Prior feature: Download Videos from Web Pages to Drive (`002-url-video-download`)

Paste a web-page (or direct) URL; the server examines the page for video and downloads the chosen
video into the user's own drive as an ordinary file. Runs server-side in the background (survives
disconnect/restart) with progress, cancel, retry, and per-user history. For technologies, design,
and constraints, read the current plan and its companion artifacts:

- Plan: `specs/002-url-video-download/plan.md`
- Spec: `specs/002-url-video-download/spec.md`
- Research (decisions + rationale): `specs/002-url-video-download/research.md`
- Data model: `specs/002-url-video-download/data-model.md`
- API contract: `specs/002-url-video-download/contracts/openapi.yaml`
- Quickstart/validation: `specs/002-url-video-download/quickstart.md`

Builds on the foundational feature `001-personal-cloud-drive` (its plan/spec/artifacts remain the
reference for the core app).

**Stack**: extends the feature-001 stack (TypeScript · Node.js 22 · Fastify · SQLite/Drizzle ·
React+Vite · Vitest/Playwright). Adds: a `downloads` SQLite job table + in-process worker pool
(5 concurrent per user); local **`yt-dlp`** binary (spawned, arg-array) as the extractor/downloader
with **`ffmpeg`** for segment merge; **headless Chromium (Playwright)** as a JS-render fallback only
when static extraction fails; a shared **SSRF url-guard**. **Non-negotiables** (project
constitution): authenticate every path (default deny) and enforce strict per-user isolation
(cross-user → uniform 404); keep data self-hosted (tools are local, only outbound traffic is the
user-requested content fetch — no telemetry); atomic crash-safe finalize so no partial file is ever
visible; refuse internal/self URLs (SSRF); secrets from env only.
<!-- SPECKIT END -->
