<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification of the project constitution (MAJOR baseline).

Modified principles (placeholder → concrete):
- [PRINCIPLE_1_NAME] → I. Security & Authentication First (NON-NEGOTIABLE)
- [PRINCIPLE_2_NAME] → II. Strict Per-User Data Isolation (NON-NEGOTIABLE)
- [PRINCIPLE_3_NAME] → III. Self-Hosted Data Ownership
- [PRINCIPLE_4_NAME] → IV. Media-First, Intuitive UI
- [PRINCIPLE_5_NAME] → V. Reliable Sync & Data Integrity

Added sections:
- Security & Privacy Requirements (was [SECTION_2_NAME])
- Development Workflow & Quality Gates (was [SECTION_3_NAME])

Removed sections: none

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — "Constitution Check" gate is generic
  ("[Gates determined based on constitution file]") and resolves against this file at
  plan time; no edit required.
- ✅ .specify/templates/spec-template.md — no constitution-specific references; no edit required.
- ✅ .specify/templates/tasks-template.md — no constitution-specific references; no edit required.

Follow-up TODOs: none
-->

# FtDrive Constitution

FtDrive is a self-hosted, Google Drive-like personal cloud that runs on the owner's own
hardware and stores all data on the owner's own disks. This constitution defines the
non-negotiable principles every feature, design, and change MUST honor.

## Core Principles

### I. Security & Authentication First (NON-NEGOTIABLE)

Authentication and authorization are prerequisites, not features added later.

- Every request that touches user data MUST be authenticated; there are no anonymous data
  paths. Default behavior is deny.
- Passwords MUST be stored only as salted, slow one-way hashes (e.g. Argon2id or bcrypt).
  Plaintext or reversible storage of credentials or secrets is forbidden.
- Sessions/tokens MUST expire, be revocable, and be transmitted only over encrypted
  transport (TLS/HTTPS). Cookies carrying session state MUST be `HttpOnly` and `Secure`.
- Secrets (keys, tokens, DB credentials) MUST come from configuration/environment, never
  hard-coded or committed to the repository.
- Inputs MUST be validated and file paths sanitized; the system MUST be resistant to
  path traversal, injection, and unauthorized file access.

Rationale: The system exposes the owner's personal files to a network. A single
authentication or authorization gap defeats the entire purpose of the product.

### II. Strict Per-User Data Isolation (NON-NEGOTIABLE)

A user MUST be able to see, list, and act on only their own data — never another user's.

- Every read, list, write, move, share, and delete operation MUST be scoped server-side to
  the authenticated owner. Client-supplied identifiers MUST never be trusted to imply
  ownership.
- Ownership MUST be enforced at the data-access layer (queries filtered by owner) AND
  re-checked before returning files or metadata. UI-only hiding is not isolation.
- No endpoint may leak the existence of another user's files, folders, or metadata —
  including via IDs, counts, errors, timing, or thumbnails.
- Storage layout MUST keep each user's files separated so a bug in one path cannot expose
  another user's bytes.

Rationale: The owner explicitly requires that each user sees only their own data with no
exceptions. Isolation is a correctness property and MUST be testable, not aspirational.

### III. Self-Hosted Data Ownership

FtDrive runs on the owner's hardware and the owner's data stays under the owner's control.

- All primary user data MUST be stored on local/owner-controlled storage. No third-party
  cloud is a required dependency for storing or serving user files.
- The system MUST run on a single self-hosted machine without mandatory external SaaS
  accounts. Optional external services MUST be opt-in and degrade gracefully when absent.
- No user file content or personal metadata may be sent to external services (telemetry,
  analytics, AI, CDNs) without explicit owner opt-in.
- Backup and restore of user data MUST be possible using only local tooling and the
  owner's own storage.

Rationale: The entire motivation is a private cloud on the owner's own hard drive;
dependence on outside providers would betray that goal.

### IV. Media-First, Intuitive UI

The interface MUST make browsing folders, photos, and videos effortless.

- The UI MUST present a clear folder/file hierarchy with navigation, and render image and
  video thumbnails/previews for visual content.
- The interface MUST be responsive and usable on both desktop and phone-sized screens.
- Common actions (upload, download, move, rename, delete, create folder, preview) MUST be
  reachable without reading documentation.
- Loading and error states MUST be explicit; large libraries MUST remain navigable
  (e.g. pagination or lazy loading) rather than blocking on full loads.

Rationale: The owner wants to "easily show my folders, photo, video"; a personal cloud is
only useful if the day-to-day experience of finding and viewing media is pleasant.

### V. Reliable Sync & Data Integrity

Moving files in and out — including phone sync — MUST be safe and trustworthy.

- Any remote-access or sync mechanism (including mobile sync) MUST use an encrypted,
  authenticated transport. Plaintext FTP is forbidden for any network-exposed access; use
  SFTP, FTPS, WebDAV-over-HTTPS, or an HTTPS sync API instead.
- File operations MUST be safe against partial writes and interruptions: uploads and syncs
  MUST not corrupt or silently lose existing data, and incomplete transfers MUST be
  recoverable or cleanly discarded.
- Destructive operations (overwrite, delete) MUST be deliberate and, where feasible,
  reversible (e.g. trash/versioning) rather than immediate and permanent.
- Mobile sync MUST respect the same authentication and per-user isolation guarantees as the
  web interface (Principles I and II).

Rationale: A storage product that loses, corrupts, or insecurely exposes files during
transfer is worse than no product. Sync convenience MUST never weaken security or integrity.

## Security & Privacy Requirements

- Transport: All network access (web UI, API, mobile sync) MUST be served over TLS. If
  exposed beyond the home LAN, access MUST go through a hardened reverse proxy or VPN —
  never a raw, unencrypted port to the internet.
- Storage at rest: At-rest encryption of the storage volume SHOULD be enabled (e.g. full-disk
  or volume encryption) so that loss of physical disks does not expose user data.
- Least privilege: Service processes MUST run with the minimum OS privileges needed and MUST
  NOT run as root/Administrator for normal operation.
- Auditability: Authentication events and security-relevant actions (login, failed login,
  permission denials) SHOULD be logged without recording secrets or full file contents.
- Privacy: The system MUST NOT phone home or emit user data by default; any outbound
  connection MUST be documented and owner-controllable.

## Development Workflow & Quality Gates

- Constitution Check: Every plan (`/speckit-plan`) and review MUST verify compliance with the
  principles above before implementation proceeds. Violations MUST be fixed or explicitly
  justified in the plan's Complexity Tracking section.
- Security & isolation are gating: Changes that touch authentication, authorization, file
  access, or sync MUST include tests or a documented verification proving that per-user
  isolation (Principle II) and authentication (Principle I) hold, including negative cases
  (a user cannot reach another user's data).
- Secrets hygiene: No credentials, keys, or tokens may be committed. Configuration and
  secrets MUST be externalized.
- Simplicity: Prefer the simplest design that satisfies the principles. Additional
  complexity, dependencies, or external services MUST be justified against the goals of a
  single-owner, self-hosted system.
- Data safety in changes: Migrations or changes to storage layout MUST preserve existing
  user data and provide a tested path forward (and, where feasible, back).

## Governance

This constitution supersedes other practices and conventions for FtDrive. When guidance
conflicts, the principle marked NON-NEGOTIABLE wins, then the remaining principles in order.

- Amendments: Changes to this document MUST be recorded here with an updated version and
  date, and a short rationale. Dependent templates (plan, spec, tasks) MUST be re-checked for
  alignment when principles change.
- Versioning policy (semantic):
  - MAJOR: Removing or redefining a principle in a backward-incompatible way.
  - MINOR: Adding a new principle or section, or materially expanding guidance.
  - PATCH: Clarifications and wording fixes with no change in meaning.
- Compliance review: Plans and significant changes MUST be checked against these principles.
  Any accepted deviation MUST be documented and time-bounded, never silent.

**Version**: 1.0.0 | **Ratified**: 2026-06-28 | **Last Amended**: 2026-06-28
