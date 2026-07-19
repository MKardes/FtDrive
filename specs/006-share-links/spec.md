# Feature Specification: File & Folder Sharing (Direct User Shares + Open Links)

**Feature Branch**: `006-share-links`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Comprehensive sharing for the drive: a user can create a share link
for a specific file or folder they own. Two kinds of shares: (1) direct shares targeted at
specific other users of the drive, who then see the shared item and can view/download it; (2) open
'anyone with the link' shares, where whoever has the link can view/download the file or browse the
shared folder and download its contents without an account. Owners can manage (list, revoke) their
shares."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share via an open link (Priority: P1)

A signed-in user picks a file or folder in their drive and creates an "anyone with the link"
share. The system produces a unique, unguessable link the owner can copy and send to anyone —
including people with no FtDrive account. A visitor who opens the link can view/preview the shared
file (or browse the shared folder and its subfolders) and download files, without signing in.
Nothing outside the shared item is reachable from the link, and the owner can turn the link off at
any time.

**Why this priority**: This is the core value of the feature — getting a file or folder to
someone outside the system with a single link. It is useful on its own even with a single user
account, so it is the smallest viable slice.

**Independent Test**: Can be fully tested with one user account and one incognito/logged-out
browser window: create a link share, open the link without a session, verify view/browse/download
works, verify everything else is unreachable, disable the link, verify it stops working.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing a file they own, **When** they create an open-link share
   and open the resulting link in a browser with no signed-in session, **Then** a share page
   shows the file's name and preview (where the type supports preview) and the file can be
   downloaded without an account.
2. **Given** an open-link share on a folder, **When** a visitor opens the link, **Then** they see
   that folder's files and subfolders, can navigate into subfolders, preview media, and download
   any file inside the shared folder's subtree.
3. **Given** a visitor holding a folder-share link, **When** they attempt to reach any item
   outside the shared folder's subtree (for example by manipulating identifiers or addresses),
   **Then** the system denies access with the same uniform "not found" response it gives for
   nonexistent content.
4. **Given** an open-link share the owner has turned off, **When** anyone opens the old link,
   **Then** they see a generic "not available" outcome that reveals nothing about what was shared
   or whether it ever existed.
5. **Given** a signed-in user viewing an item that already has an active open-link share,
   **When** they open the share option again, **Then** they are shown the existing link (with the
   option to copy or revoke it) rather than silently receiving a second, different link.

---

### User Story 2 - Share directly with other drive users (Priority: P2)

A signed-in user shares a file or folder with one or more users of the same FtDrive system,
**addressing them by email**: they type an email address and it resolves to the matching local
account (accounts without an email remain reachable by username). Each recipient, once signed
in, finds the item in a dedicated "Shared with me" area and can browse it, preview media, and
download files — read-only. Users who were not named see nothing.

**Why this priority**: Delivers person-to-person sharing inside the household/team without
exposing anything to the open web. Depends on the same share concepts as User Story 1 but
requires a second account to exercise, so it lands after the link flow.

**Independent Test**: Can be fully tested with two user accounts: user A shares a folder with
user B; B sees and reads it in "Shared with me"; a third user C sees nothing; A revokes and B's
access ends.

**Acceptance Scenarios**:

1. **Given** users A and B on the same system, **When** A shares a folder with B, **Then** B sees
   that folder in "Shared with me" (attributed to A), can browse its current and future contents,
   preview media, and download files.
2. **Given** B is viewing content shared by A, **When** B attempts to rename, move, delete,
   upload into, or re-share that content, **Then** the action is unavailable or denied — access
   is strictly read-only.
3. **Given** A shared an item with B only, **When** user C probes for that item (for example by
   guessing identifiers), **Then** C receives the same uniform "not found" response as for any
   content that does not exist for them.
4. **Given** A shared an item with B, **When** A revokes B's access, **Then** the item disappears
   from B's "Shared with me" and any direct access attempt by B is denied from that point on.
5. **Given** A is choosing recipients, **When** A types an email address, **Then** matching
   accounts are suggested and selecting one adds it to the recipient set; one action grants all
   selected people access, and A can later revoke each recipient independently.
6. **Given** A types an email that matches no account on this system, **When** no suggestion
   appears, **Then** A sees a clear "no user with that email" message — no grant is created and
   no invitation is sent.

---

### User Story 3 - Manage my shares in one place (Priority: P3)

A signed-in user opens a "My shares" overview listing everything they have shared: which item,
what kind of share (open link or direct), who the recipients are, when it was created, and any
expiration. From there they can copy links, add or remove recipients, set or change an expiration
date, and revoke any share. They can also see and manage an item's shares from the item itself.

**Why this priority**: Owners can already revoke from the item (Stories 1–2); the consolidated
overview and expiration add control and hygiene on top of the two sharing flows and depend on
them existing first.

**Independent Test**: Can be fully tested by creating several shares of both kinds, verifying
the overview lists them all accurately, changing an expiration, revoking from the overview, and
confirming access ends.

**Acceptance Scenarios**:

1. **Given** a user with several active shares of both kinds, **When** they open the shares
   overview, **Then** every active share is listed with its item, kind, recipients (for direct
   shares), creation date, and expiration (if any).
2. **Given** a share with an expiration set, **When** the expiration time passes, **Then** the
   share stops working exactly as if it had been revoked, with no action from the owner.
3. **Given** the shares overview, **When** the owner revokes a share from the list, **Then** the
   corresponding link or recipient access stops working immediately for new requests.
4. **Given** an item with an active share, **When** the owner views that item's share details,
   **Then** the same manage actions (copy link, edit recipients, set expiry, revoke) are
   available there as in the overview.

---

### Edge Cases

- **Shared item is moved to Trash or deleted**: all shares of it (and of anything inside it)
  immediately stop resolving for recipients and link visitors — uniform "not found". If the item
  is restored from Trash, existing shares resume working; permanent deletion permanently breaks
  them.
- **Shared item is renamed or moved** within the owner's drive: shares stay attached to the item
  and keep working; recipients and visitors see the new name/location naturally.
- **Recipient's account is removed** by the system owner: that recipient's direct shares
  disappear with the account; other recipients and link shares are unaffected.
- **Duplicate grants**: sharing an item with a user who already has it, or requesting a new open
  link where one is active, must not create a second grant — the existing one is surfaced.
- **Nested shares**: a folder inside an already-shared folder can itself be shared; each share is
  independent, and revoking one never affects the other.
- **Folder contents change after sharing**: folder shares are live — files added later are
  visible/downloadable through the share; files removed stop being available.
- **Guessing links**: share links must be practically impossible to guess, and repeated failed
  attempts to open share links must be throttled the same way failed logins are.
- **Revoked/expired/never-existed links look identical**: no difference in response that would
  confirm a link used to be valid.
- **Large shared folders**: an anonymous share page for a folder with thousands of items must
  stay navigable (paged or progressively loaded), matching the media-first browsing experience.
- **In-flight downloads at revocation**: a download already streaming when the share is revoked
  may complete, but every new request after revocation is denied.
- **Sharing content you don't own**: attempting to create a share for an item not owned by the
  requester is answered with the same uniform "not found" as for nonexistent content (no
  ownership probing).
- **Self-sharing**: a user cannot direct-share an item to themselves; the option is absent or the
  attempt is rejected with a clear message.
- **Email matches no account**: typing an outside email (someone not on this system) suggests
  nothing and shows "no user with that email"; no grant is created and no email is sent. Use an
  open link for people without accounts.
- **Duplicate or reassigned emails**: an email can belong to at most one account; assigning an
  in-use email is rejected. Removing/changing an account's email never breaks existing grants
  (grants bind to the account, not the address).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create a share for any single file or folder they own,
  choosing between the two kinds: an open link ("anyone with the link") or a direct share to one
  or more named users of the same system. Creating a share MUST be reachable from the item
  itself in the drive UI.
- **FR-002**: For open-link shares, the system MUST generate a unique, practically unguessable
  link. Anyone presenting that link MUST be able to view/preview the shared file — or browse the
  shared folder's subtree with previews — and download files, without an account or sign-in.
- **FR-003**: Access through a share (either kind) MUST be limited to exactly the shared item
  and, for folders, its subtree. Any attempt to reach content outside that scope through the
  share MUST be denied with the same uniform "not found" response used for nonexistent content.
- **FR-004**: For direct shares, recipients are addressed by **email**: typing an email in the
  share dialog MUST resolve to the matching local account (username remains the fallback for
  accounts without an email). Each named recipient MUST see the shared item in a dedicated
  "Shared with me" area after signing in, attributed to the sharing user, and MUST be able to
  browse, preview, and download it. An email that matches no local account MUST yield a clear
  message and no grant.
- **FR-005**: All shared access MUST be read-only: recipients and link visitors MUST NOT be able
  to rename, move, delete, upload into, modify, or re-share shared content.
- **FR-006**: Owners MUST be able to see all of their own shares in one overview — item, kind,
  recipients (for direct shares), creation date, expiration (if any) — and also see and manage
  the shares of a specific item from that item.
- **FR-007**: Owners MUST be able to revoke any share (a whole link share, or individual
  recipients of a direct share) at any time; revocation MUST take effect for all new access
  attempts immediately.
- **FR-008**: Owners MUST be able to set an optional expiration date/time on any share at
  creation or later; once the expiration passes, the share MUST behave exactly as if revoked.
- **FR-009**: Only the item's owner MUST be able to create, view, modify, or revoke shares of
  that item. Attempts against items the requester does not own MUST receive the uniform "not
  found" response.
- **FR-010**: Shares MUST follow the item, not its name or location: renaming or moving a shared
  item within the owner's drive MUST NOT break the share. Moving the item to Trash MUST suspend
  all access through its shares; restoring it MUST resume them; permanent deletion MUST end them
  permanently.
- **FR-011**: Folder shares MUST reflect the live folder: content added after the share was
  created is included, content removed is no longer available.
- **FR-012**: Requests with revoked, expired, or never-issued links MUST be indistinguishable
  from one another — a single uniform "not available" outcome that discloses no metadata and
  does not confirm past existence.
- **FR-013**: Creating a share that duplicates an existing active grant (same item + same link
  kind, or same item + same recipient) MUST NOT create a second grant; the existing share MUST
  be surfaced instead.
- **FR-014**: The system MUST throttle repeated failed attempts to open share links (invalid or
  revoked links) so links cannot be discovered by systematic guessing.
- **FR-015**: Share pages for anonymous visitors MUST render media previews/thumbnails and
  remain navigable for large folders (paged or progressively loaded), consistent with the
  drive's media-first browsing experience, on both desktop and phone-sized screens.
- **FR-016**: Recipients' "Shared with me" content MUST be visibly distinguished from their own
  drive content (including who shared it), and MUST never be counted or mixed into the
  recipient's own storage or folder tree.
- **FR-017**: The system owner MUST be able to record an optional email address on each user
  account (at creation or later, changeable and removable). Emails MUST be unique across
  accounts and are stored normalized (case-insensitive matching). Wherever a share recipient is
  shown or chosen, the email is the primary label, with username as fallback.

### Key Entities

- **Share**: an owner-created grant of read access to exactly one file or folder the owner
  owns. Attributes: the shared item, the owning user, kind (open link or direct), creation
  time, optional expiration, and state (active / revoked). A link share carries its unguessable
  link; a direct share carries its list of recipient users. Revoking or expiring a share ends
  the access it granted and nothing else.
- **Share recipient**: a named user of the same system granted access by a direct share,
  addressed and displayed by their account email (username when no email is set).
  Individually revocable; removal of the user account removes the grant.
- **Account email**: an optional, unique, owner-managed email address on a user account — the
  addressing identity for direct shares. Changing or clearing it affects how the person is
  addressed, never what they can access.
- **"Shared with me" listing**: the recipient-facing collection of all active direct shares
  naming that user, each attributed to its owner. Purely a view of grants — the items remain
  owned, stored, and counted under the sharing user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can create an open-link share and have the link on their clipboard in
  under 15 seconds / at most 3 interactions from the item.
- **SC-002**: A person with a valid share link and no account can start viewing or downloading
  the shared content in at most 2 interactions from opening the link, with no sign-in step.
- **SC-003**: In isolation testing, 100% of access attempts outside a share's scope — crafted
  identifiers, revoked or expired links, other signed-in users probing direct shares — are
  denied with the uniform "not found" outcome, with zero leakage of names, counts, or existence.
- **SC-004**: Revoking or expiring a share stops every new access attempt within 5 seconds of
  the revocation/expiry.
- **SC-005**: A direct-share recipient sees the shared item in "Shared with me" on their next
  page load after the grant, with no action required from the recipient.
- **SC-006**: Systematic guessing of share links is infeasible: enumeration attempts have a
  negligible chance of ever finding a valid link before throttling makes further attempts
  impractical.
- **SC-007**: 90% of first-time users asked to "share this folder with your phone-only friend"
  complete the task without documentation, using only what the UI offers.

## Assumptions

- **"Users" are accounts on this FtDrive instance** (owner-provisioned, per feature 001). An
  email on an account is an addressing label for those local accounts — there are no external
  identities, no server-sent email invitations, and no federation. Direct shares target existing
  local accounts only; the system never sends email.
- **All sharing is read-only in v1.** View, preview, browse, and download only. Write access,
  collaborative editing, and upload-into-shared-folder are out of scope.
- **Expiration is the only lifetime control in v1.** Password-protected links, download-count
  limits, and per-visitor tracking are out of scope.
- **Recipient picking may reveal usernames and account emails.** Signed-in users can see the
  account names and emails on the instance when choosing recipients — acceptable for a small
  household/team server, and it reveals nothing about anyone's content. (Principle II's
  isolation of files/metadata is unaffected.)
- **No whole-folder archive download in v1.** Link visitors and recipients download files
  individually; a "download all as archive" convenience is out of scope.
- **Recipient search does not index shared content in v1.** A recipient's search covers their
  own drive; "Shared with me" is browsed directly.
- **Re-sharing is not permitted.** Only the owner of an item can share it; recipients cannot
  extend access to others.
- **Anonymous access is a deliberate, owner-granted exception** to the signed-in-only rule: the
  unguessable link itself acts as the visitor's authorization, scoped to exactly one share. All
  other constitution guarantees (owner-scoped operations, uniform not-found, encrypted
  transport, throttling) apply unchanged.
