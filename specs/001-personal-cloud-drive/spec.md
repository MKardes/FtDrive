# Feature Specification: FtDrive — Personal Cloud Drive Web Application

**Feature Branch**: `001-personal-cloud-drive`

**Created**: 2026-06-28

**Status**: Approved

**Input**: User description: "I wnat you to create a web app on node js withtypescript. And a responsive UI is needed for phone usages."

> Context: This is the foundational feature of **FtDrive**, a self-hosted, Google Drive–like
> personal cloud (see the project constitution). The request describes the overall product —
> a web application with a responsive interface usable from a phone — so this specification
> defines the core personal-cloud experience: secure access, browsing and previewing media,
> and managing files, with strict per-user privacy. Implementation technology is intentionally
> left to the planning phase.

## Clarifications

### Session 2026-06-29

- Q: When a user intentionally replaces an existing file, are previous versions kept? → A: No version history in v1 — deletes go to trash and name collisions keep both copies; there is no "replace" that discards a prior version.
- Q: How should the login endpoint defend against brute-force / credential-guessing? → A: Rate-limit and progressively throttle repeated failed logins (temporary back-off per account and/or source); no permanent account lockout.
- Q: Is search in scope for v1? → A: Yes — include search by file/folder name within the user's own space (results respect per-user isolation); full-text/content search remains out of scope.
- Q: Can users manage their own password, and how is a forgotten password handled? → A: For v1, signed-in users can change their own password (with current password); forgotten-password recovery is owner-assisted (owner resets/issues a new credential). Email-based self-service reset is deferred to a future feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and browse my private files and media (Priority: P1)

A user opens FtDrive in a browser (on a desktop or a phone), signs in to their own private
space, and browses their folders and files. They see thumbnails for photos and videos, open a
photo to view it full-screen, and play a video — all without anyone else being able to see
their content.

**Why this priority**: This is the heart of a "media-first" personal cloud and the minimum that
delivers value: a private, browsable view of one's own photos and videos. It also establishes
the non-negotiable authentication gate that every other capability depends on.

**Independent Test**: Provision a user with some folders, images, and videos. Verify the user
must sign in before seeing anything, can navigate the folder hierarchy, sees thumbnails, can
open a photo full-screen and play a video, and that an un-authenticated visitor sees no content
or metadata at all.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they request any file, folder, or
   listing, **Then** access is denied and no file content or metadata is revealed.
2. **Given** a signed-in user with folders and media, **When** they open the app on a phone,
   **Then** they see a navigable folder/file hierarchy with image and video thumbnails sized
   for the screen.
3. **Given** a signed-in user viewing a folder, **When** they tap a photo, **Then** the photo
   opens in a full-screen preview; **When** they tap a video, **Then** it plays in the browser.
4. **Given** a signed-in user, **When** their session expires or they sign out, **Then** further
   access to files requires signing in again.
5. **Given** a signed-in user with many items, **When** they search by file or folder name,
   **Then** they see matching items from their own space only, and no items belonging to any
   other user.

---

### User Story 2 - Upload and download files from any device (Priority: P2)

A user adds files to their cloud — for example, uploading photos taken on their phone — and
later downloads any file back to whatever device they are using.

**Why this priority**: Storing and retrieving files turns a viewer into an actual personal
cloud. Phone-friendly upload/download is the practical reason for the responsive UI.

**Independent Test**: Signed in on a phone, select one or more photos/files and upload them;
confirm they appear in the chosen folder with correct names and previews; then download a file
and confirm the retrieved copy is identical to the original.

**Acceptance Scenarios**:

1. **Given** a signed-in user in a folder, **When** they choose one or more files to upload
   (including photos/videos from a phone), **Then** the files are stored in that folder and
   become visible with correct names and thumbnails.
2. **Given** an upload in progress, **When** it is interrupted (lost connection, closed tab),
   **Then** existing files are never corrupted and the incomplete upload is cleanly discarded
   (no partial file is left behind), requiring the user to re-initiate it.
3. **Given** a signed-in user, **When** they download a file, **Then** the downloaded copy is
   byte-for-byte identical to the stored file.
4. **Given** a user uploading a file whose name already exists in the folder, **When** the
   upload completes, **Then** the system handles the conflict without silently overwriting
   (e.g., keeps both via a distinct name or prompts the user).

---

### User Story 3 - Organize my library (Priority: P3)

A user keeps their cloud tidy by creating folders and renaming, moving, and deleting files and
folders, with confidence that accidental deletions can be recovered.

**Why this priority**: Organization makes a growing library usable over time. Safe, reversible
deletion protects the user's data, which matters more than raw convenience.

**Independent Test**: Signed in, create a folder, rename a file, move a file into the new
folder, delete a file, then recover it from trash — verifying each action takes effect and that
deletion is reversible within the retention window.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a folder, rename an item, or move an item,
   **Then** the change is reflected immediately and persists across sessions.
2. **Given** a signed-in user, **When** they delete a file or folder, **Then** it is moved to a
   recoverable trash rather than being immediately and permanently destroyed.
3. **Given** an item in trash within the retention window, **When** the user restores it,
   **Then** it returns to its original location.
4. **Given** a user deleting a non-empty folder, **When** they confirm, **Then** the action is
   deliberate (requires confirmation) and the folder's contents are recoverable together.

---

### User Story 4 - Keep every user's data fully private (Priority: P2)

The system owner provisions accounts for multiple people. Each person signs in and sees only
their own files; no user can see, list, or reach another user's data by any means.

**Why this priority**: Per-user isolation is a non-negotiable correctness and privacy property
of FtDrive. It is prioritized alongside upload/download because the product is unsafe to use
with more than one person until isolation is proven.

**Independent Test**: Provision two users, each with their own files. Signed in as user A,
attempt to view, list, download, or otherwise reference user B's files and folders (including by
guessing identifiers) and confirm every attempt fails and reveals nothing about user B's data.

**Acceptance Scenarios**:

1. **Given** two users A and B with separate files, **When** user A browses, searches, or lists,
   **Then** only user A's own content ever appears.
2. **Given** user A who somehow learns or guesses an identifier belonging to user B, **When**
   user A requests that item, **Then** access is denied and the response does not reveal whether
   the item exists.
3. **Given** the system owner, **When** they provision or remove a user account, **Then** that
   user gains or loses access to their own isolated space without affecting other users' data.

---

### Edge Cases

- **Large libraries**: A folder with thousands of items must remain navigable (pagination or
  lazy loading) instead of blocking on a full load.
- **Unsupported media**: A file whose type cannot be previewed in the browser offers a download
  fallback and a clear indication that no preview is available.
- **Interrupted transfers**: Uploads/downloads cut off mid-transfer must not corrupt or partly
  overwrite existing files; incomplete uploads are cleanly discarded and must be re-initiated.
- **Name collisions**: Uploading or moving an item into a folder that already contains an item
  with the same name is resolved without silent data loss.
- **Destructive actions**: Deleting non-empty folders and emptying trash require deliberate
  confirmation; permanent deletion only happens after the retention window or explicit purge.
- **Session lifecycle**: Expired or revoked sessions immediately lose access; re-authentication
  is required.
- **Path/identifier tampering**: Crafted paths or identifiers must not allow access outside the
  user's own space (no traversal, no cross-user access).
- **Repeated failed logins**: A burst of wrong-password attempts triggers progressive
  throttling/back-off without permanently locking the legitimate account out and without
  disclosing whether the account exists.
- **Constrained devices/networks**: The interface remains usable on small phone screens and on
  slow or intermittent home connections, with explicit loading and error states.
- **Concurrent edits**: The same user acting from two devices at once must not corrupt listings
  or files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require authentication for every request that touches user files
  or metadata; unauthenticated requests MUST be denied by default with no data revealed.
- **FR-002**: The system MUST allow a signed-in user to browse their folder/file hierarchy and
  navigate into and out of folders.
- **FR-003**: The system MUST display thumbnails/previews for image and video files and allow
  full-screen viewing of photos and in-browser playback of videos.
- **FR-004**: The system MUST allow a signed-in user to upload one or more files (including
  photos and videos from a phone) into a chosen folder.
- **FR-005**: The system MUST allow a signed-in user to download their files, retrieving content
  identical to what was stored.
- **FR-006**: The system MUST allow a signed-in user to create folders and to rename and move
  files and folders.
- **FR-007**: The system MUST treat deletion as reversible by moving deleted items to a
  recoverable trash, and MUST allow restoring items within a defined retention window before
  permanent removal.
- **FR-008**: The system MUST require explicit confirmation for destructive actions (deleting
  non-empty folders, emptying trash, permanent deletion).
- **FR-009**: The system MUST scope every read, list, upload, download, move, rename, and delete
  operation to the authenticated user server-side, so a user can act only on their own data.
- **FR-010**: The system MUST NOT reveal the existence of another user's files, folders, or
  metadata through listings, identifiers, counts, errors, or previews.
- **FR-011**: The system MUST present a responsive interface that is fully usable on phone-sized
  screens as well as on desktop, with all primary actions reachable on a phone.
- **FR-012**: The system MUST show explicit loading and error states, and MUST keep large
  libraries navigable (e.g., pagination or lazy loading) rather than blocking on full loads.
- **FR-013**: The system MUST handle name collisions on upload or move without silently
  overwriting existing data (e.g., keep both via a distinct name or prompt the user). The
  system MUST NOT maintain prior versions of files; recovery is provided only through trash
  for deleted items.
- **FR-014**: The system MUST protect existing files from corruption or partial overwrite when a
  transfer is interrupted; incomplete uploads MUST be cleanly discarded (leaving no partial or
  corrupt file), after which the user re-initiates the upload.
- **FR-015**: The system MUST allow the owner to provision and remove user accounts, each with
  an isolated personal space.
- **FR-016**: The system MUST store all primary user data on owner-controlled storage and MUST
  NOT require any third-party cloud service to store or serve user files.
- **FR-017**: The system MUST serve all access over encrypted, authenticated transport and MUST
  store credentials only in a non-recoverable (hashed) form.
- **FR-018**: The system MUST NOT send user file content or personal metadata to external
  services without the owner's explicit opt-in.
- **FR-019**: The system MUST expire and allow revocation of user sessions, requiring
  re-authentication afterward.
- **FR-020**: The system MUST rate-limit and progressively throttle repeated failed login
  attempts (temporary back-off scoped per account and/or source) to resist brute-force and
  credential-guessing; it MUST NOT permanently lock accounts. Failed-login throttling MUST NOT
  reveal whether a given account exists.
- **FR-021**: The system MUST allow a signed-in user to search for files and folders by name
  within their own space. Search results MUST respect per-user isolation (only the user's own
  items appear). Full-text search of file contents is out of scope.
- **FR-022**: The system MUST allow a signed-in user to change their own password by supplying
  their current password. The system MUST allow the owner to reset a user's password (issue a
  new credential) for forgotten-password recovery. Self-service email-based password reset is
  out of scope for v1.

### Key Entities *(include if feature involves data)*

- **User**: A person with a private space in FtDrive. Key attributes: identity/login name,
  securely stored credentials, account status. Owns folders and files; provisioned by the owner.
- **Folder**: A named container within a user's space. Attributes: name, parent folder, owner,
  timestamps. Forms the navigable hierarchy.
- **File**: A stored item (including photos and videos). Attributes: name, size, media/type,
  owner, containing folder, created/modified timestamps, and preview availability.
- **Trash Item**: A deleted file or folder retained for recovery. Attributes: original location,
  deletion time, retention deadline.
- **Session**: An authenticated period of access for a user. Attributes: associated user,
  expiry, revocation state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of file and metadata access requires authentication — an unauthenticated
  visitor can retrieve zero files and zero metadata.
- **SC-002**: In isolation testing, 100% of attempts by one user to access another user's files
  or metadata (including by guessing identifiers) are denied with no information disclosed.
- **SC-003**: A signed-in user can locate and open a specific photo or video from their library
  in under 30 seconds on a phone.
- **SC-004**: Uploading a typical phone photo completes and the photo appears with a thumbnail
  within 10 seconds on a normal home network.
- **SC-005**: The interface is fully usable on screens as narrow as 360 px, with every primary
  action (browse, preview, upload, download, organize) reachable without horizontal scrolling.
- **SC-006**: Browsing a folder containing 1,000+ items shows first content in under 2 seconds
  and scrolls smoothly without loading the entire folder at once.
- **SC-007**: At least 95% of first-time users complete sign-in and successfully view a photo
  without needing assistance or documentation.
- **SC-008**: Interrupted uploads result in zero corrupted or partially overwritten existing
  files across repeated interruption tests.
- **SC-009**: Files deleted by mistake are recoverable from trash for at least the retention
  window (default 30 days) in 100% of cases before permanent deletion.

## Assumptions

- **Multi-user, owner-provisioned**: The system supports multiple users whose accounts are
  created by the system owner. Open public self-registration is NOT provided, consistent with a
  private, self-hosted product. Each user has an isolated personal space.
- **"Phone usage" means a responsive web UI**: Phone support is delivered as a responsive web
  interface usable in a phone browser (browse, preview, manual upload/download). Automated
  background mobile sync or a native auto-upload client is OUT OF SCOPE for this feature and may
  be addressed as a future capability.
- **Media coverage**: In-browser preview/playback targets common image and video formats; less
  common formats fall back to download with a clear "no preview" indication.
- **Self-hosted storage**: All user data resides on the owner's local/owner-controlled storage;
  backups are performed by the owner using local tooling. No third-party cloud is required.
- **Encrypted access & deployment**: All access is over encrypted transport; if exposed beyond
  the home network, the system is reached through a hardened reverse proxy or VPN, not a raw
  open port.
- **Trash retention**: Deleted items are retained for a default of 30 days before permanent
  deletion (configurable by the owner).
- **Upload size**: Reasonably large files (including videos) are supported; the exact per-file
  size limit is determined during planning.
- **Single instance**: The product runs as a single self-hosted instance without mandatory
  external SaaS dependencies.

## Out of Scope (this feature)

- Native mobile applications and automated background phone sync / camera auto-upload.
- Resumable uploads (interrupted uploads are discarded and re-initiated in v1; see FR-014).
- Sharing files between users or generating public share links.
- Real-time collaboration or in-browser document/photo editing.
- File version history (keeping previous versions of a replaced file); deleted items remain
  recoverable via trash and name collisions keep both copies.
- Full-text / content search inside files (search by file and folder *name* is in scope; see FR-021).
- Administrative analytics, billing, or organization/team management beyond basic owner
  provisioning of user accounts.
- Self-service **email-based password reset** — deferred to a future feature. v1 uses
  owner-assisted reset (see FR-022). Future TODO: add user-initiated "forgot password" recovery
  via email, which will require configuring an outbound mail service and time-limited,
  single-use reset links (must remain owner-controllable per the self-hosted principle).
