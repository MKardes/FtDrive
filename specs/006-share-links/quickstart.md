# Quickstart & Validation: File & Folder Sharing (006-share-links)

How to run the feature end-to-end and prove the spec's guarantees hold. Contract details:
[contracts/openapi.yaml](./contracts/openapi.yaml) · entities: [data-model.md](./data-model.md).

## Prerequisites

- Node.js 22, npm workspaces installed (`npm install` at repo root).
- Two user accounts to exercise direct shares (owner can create the second via **Users**):

```bash
cd backend
npm run db:migrate          # applies 0003_shares
npm run create-owner        # if no owner exists yet
npm run dev                 # API on :3000
# separate terminal:
cd frontend && npm run dev  # SPA on :5173 (proxies /api)
```

## Automated validation

```bash
cd backend && npm test      # includes shares-manage / shares-public / shares-recipient / isolation-shares
cd frontend && npm test     # includes ShareDialog test
npm run typecheck -w backend -w frontend
```

The isolation suite is the constitution gate: cross-user probing, out-of-subtree access,
revoked/expired/invalid uniformity, and trash interplay must all pass.

## Manual walkthrough

### US1 — open link (P1)

1. Sign in as user A, open a folder with photos/videos, open a card's ⋮ menu → **Share…**
2. In the dialog choose **Anyone with the link** → **Create link** → **Copy**. (SC-001: ≤ 3
   interactions.)
3. Open the copied `http://<host>/s/<token>` in a private/incognito window (no session):
   - File share → name + preview page, **Download** works with no sign-in (SC-002).
   - Folder share → grid with thumbnails; navigate into subfolders; preview a photo and a
     video (seek must work — Range/206); download a file.
4. Tamper: edit the URL's token by one character → generic "not available" page (uniform 404).
   Try a file id from A's *unshared* drive against
   `/api/public/shares/<token>/files/<id>/content` → 404.
5. Back as A: Share dialog on the same item shows the **existing** link (no second link);
   **Revoke** it. Reload the incognito tab → "not available", indistinguishable from step 4.
6. Hammer `/api/public/shares/<garbage>` > 60×/min → `429` (FR-014).

### US2 — direct share (P2)

0. As the owner, on **Users**: give user B an email (Set email, e.g. `b@family.com`).
1. As A: Share dialog → **Specific people** → type part of `b@family.com` → the suggestion
   resolves to B's account → it becomes a chip → **Share with 1**. (Picker must not offer A
   themself; disabled accounts absent; a stranger's email shows "no user with that email" and
   creates nothing.)
2. As B: **Shared** nav → item appears under *Shared with me*, attributed to A (SC-005).
   Browse it, preview media, download a file. Verify read-only: no rename/move/delete/upload
   anywhere in the shared view.
3. As a third user C: nothing in *Shared with me*; calling
   `/api/shared/<shareId>/children` with C's session → 404 (uniform).
4. As A: remove B from the item's recipients → item vanishes for B; direct API calls → 404.

### US3 — manage shares (P3)

1. Create several shares of both kinds. **Shared → My shares** lists each with item, kind,
   recipients, created date, expiry; copy-link and revoke work from the list (FR-006/007).
2. Set an expiry ~1 minute out on a link share; after it passes, the link answers the same
   "not available" (FR-008/012) with no owner action.
3. Item panel parity: the same manage actions appear in the item's Share dialog.

### Trash / lifecycle interplay (edge cases)

1. Share a folder (link + direct), then move it to Trash → link and recipient access answer
   404 while trashed.
2. Restore from Trash → both shares work again with the *same* link (FR-010).
3. Purge permanently (Trash → Delete forever) → grants are gone (rows cascade-deleted);
   re-check link → 404.
4. Rename/move the shared item within A's drive → existing link keeps working (FR-010).
5. Upload a new file into a shared folder → it appears through the link and for recipients
   (FR-011).

## Success-criteria spot checks

| SC | Check |
|----|-------|
| SC-001 | Stopwatch the create+copy flow: < 15 s, ≤ 3 interactions |
| SC-002 | Incognito → link → view/download in ≤ 2 interactions, no sign-in |
| SC-003 | `isolation-shares.test.ts` green (100% uniform 404 on out-of-scope) |
| SC-004 | Revoke, then reload within 5 s → denied |
| SC-005 | Grant to B, B reloads → visible |
| SC-006 | 256-bit tokens + per-IP 429 (shares-public test asserts both) |
| SC-007 | Walk a first-time user through US1 with no hints |
