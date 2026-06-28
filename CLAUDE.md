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
## Active feature: FtDrive — Personal Cloud Drive Web Application (`001-personal-cloud-drive`)

Self-hosted, Google Drive–like personal cloud. For technologies, project structure, conventions,
and constraints, read the current plan and its companion artifacts:

- Plan: `specs/001-personal-cloud-drive/plan.md`
- Spec: `specs/001-personal-cloud-drive/spec.md`
- Research (decisions + rationale): `specs/001-personal-cloud-drive/research.md`
- Data model: `specs/001-personal-cloud-drive/data-model.md`
- API contract: `specs/001-personal-cloud-drive/contracts/openapi.yaml`
- Quickstart/validation: `specs/001-personal-cloud-drive/quickstart.md`

**Stack**: TypeScript on Node.js 22 LTS · Fastify API · React + Vite SPA · SQLite (Drizzle ORM) +
local filesystem (per-user roots) · Argon2id + server-side sessions · sharp/ffmpeg thumbnails ·
Vitest + Playwright. **Non-negotiables** (project constitution): authenticate every data path
(default deny) and enforce strict per-user isolation server-side (cross-user access → uniform
404); keep all data self-hosted; atomic, crash-safe file writes; secrets from env only.
<!-- SPECKIT END -->
