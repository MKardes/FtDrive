import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import { users } from '../../src/db/schema';
import type { NodeRow, UserRow } from '../../src/db/schema';

interface SharedWithMeBody {
  items: Array<{
    shareId: string;
    owner: { username: string };
    node: { id: string; name: string; type: string; parentId: string | null };
  }>;
}

describe('direct shares & shared-with-me (US2, FR-004/005/011/016)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let carol: UserRow;
  let trudy: UserRow;
  let dora: UserRow;
  let aliceCookie: string;
  let bobCookie: string;
  let trudyCookie: string;
  let rid: string;
  let folder: NodeRow;
  let sub: NodeRow;
  let fileInFolder: NodeRow;
  let bobShareId: string;
  let carolShareId: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    bob = await seedUser(t.services, 'bob', 'bob-password');
    carol = await seedUser(t.services, 'carol', 'carol-password');
    trudy = await seedUser(t.services, 'trudy', 'trudy-password');
    dora = await seedUser(t.services, 'dora', 'dora-password');
    t.services.db.update(users).set({ status: 'disabled' }).where(eq(users.id, dora.id)).run();

    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);
    bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    trudyCookie = sessionCookieFor(t.app, t.services, trudy.id);
    rid = rootId(t.services, alice.id);

    folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Team' });
    sub = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: folder.id, name: 'Inner' });
    fileInFolder = await seedFile(t.services, alice.id, folder.id, 'notes.txt', Buffer.from('team notes'), 'text/plain');
    await seedFile(t.services, alice.id, sub.id, 'inner.txt', Buffer.from('inner'), 'text/plain');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('validates recipients: empty, self, unknown, disabled → 400', async () => {
    const cases = [
      { recipientIds: [] },
      { recipientIds: [alice.id] },
      { recipientIds: ['01NOSUCHUSERNOSUCHUSER0000'] },
      { recipientIds: [dora.id] },
    ];
    for (const c of cases) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/shares',
        headers: { cookie: aliceCookie },
        payload: { nodeId: folder.id, kind: 'user', ...c },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('grants several recipients in one action; each grant is separate (US2 #5)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: folder.id, kind: 'user', recipientIds: [bob.id, carol.id] },
    });
    expect(res.statusCode).toBe(201);
    const items = (res.json() as { items: Array<{ id: string; kind: string; recipient?: { username: string } }> }).items;
    expect(items).toHaveLength(2);
    const byUser = new Map(items.map((s) => [s.recipient?.username, s.id]));
    expect([...byUser.keys()].sort()).toEqual(['bob', 'carol']);
    bobShareId = byUser.get('bob') as string;
    carolShareId = byUser.get('carol') as string;
    // No token is ever minted (or exposed) for a direct share, and the
    // recipient object exposes EXACTLY {id, username} — never the user row
    // (password hash!) from the join (regression: caught live, 2026-07-13).
    for (const s of items) {
      expect((s as { token?: string }).token).toBeUndefined();
      expect(Object.keys(s.recipient as object).sort()).toEqual(['email', 'id', 'username']);
    }
  });

  it('deduplicates repeat grants to the same recipient (FR-013)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: folder.id, kind: 'user', recipientIds: [bob.id] },
    });
    expect(res.statusCode).toBe(201);
    const items = (res.json() as { items: Array<{ id: string }> }).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(bobShareId);
  });

  it('lists the grant in the recipient\'s shared-with-me, attributed to the owner (FR-004/016)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/shared-with-me', headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SharedWithMeBody;
    expect(body.items).toHaveLength(1);
    const item = body.items[0]!;
    expect(item.shareId).toBe(bobShareId);
    expect(item.owner.username).toBe('alice');
    expect(item.node.id).toBe(folder.id);
    expect(item.node.name).toBe('Team');
    // The shared root never exposes the owner's private ancestry.
    expect(item.node.parentId).toBeNull();
  });

  it('lets the recipient browse, navigate subfolders, and read content/thumbnails', async () => {
    const top = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(top.statusCode).toBe(200);
    const names = (top.json() as { items: Array<{ name: string }> }).items.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['Inner', 'notes.txt']));

    const inner = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children?nodeId=${sub.id}`,
      headers: { cookie: bobCookie },
    });
    expect(inner.statusCode).toBe(200);

    const content = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/files/${fileInFolder.id}/content`,
      headers: { cookie: bobCookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.body).toBe('team notes');

    const range = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/files/${fileInFolder.id}/content`,
      headers: { cookie: bobCookie, range: 'bytes=0-3' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.body).toBe('team');
  });

  it('reflects the live folder: files added after the grant are visible (FR-011)', async () => {
    const late = await seedFile(t.services, alice.id, folder.id, 'late.txt', Buffer.from('late'), 'text/plain');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: bobCookie },
    });
    const names = (res.json() as { items: Array<{ name: string }> }).items.map((n) => n.name);
    expect(names).toContain('late.txt');

    const content = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/files/${late.id}/content`,
      headers: { cookie: bobCookie },
    });
    expect(content.statusCode).toBe(200);
  });

  it('denies everyone but the named recipient with the uniform 404 (Principle II)', async () => {
    // A third signed-in user with bob's shareId.
    const asTrudy = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: trudyCookie },
    });
    expect(asTrudy.statusCode).toBe(404);

    // Trudy has nothing shared with her.
    const listing = await t.app.inject({ method: 'GET', url: '/api/shared-with-me', headers: { cookie: trudyCookie } });
    expect((listing.json() as SharedWithMeBody).items).toHaveLength(0);

    // Unauthenticated recipient routes are still default-deny.
    const anon = await t.app.inject({ method: 'GET', url: `/api/shared/${bobShareId}/children` });
    expect(anon.statusCode).toBe(401);

    // Out-of-subtree probe by a legitimate recipient.
    const outside = await seedFile(t.services, alice.id, rid, 'root-secret.txt', Buffer.from('s'), 'text/plain');
    const probe = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/files/${outside.id}/content`,
      headers: { cookie: bobCookie },
    });
    expect(probe.statusCode).toBe(404);

    // A link-share id is not a direct-share id (kind pinning).
    const link = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: folder.id, kind: 'link' },
    });
    const linkId = (link.json() as { items: Array<{ id: string }> }).items[0]?.id as string;
    const viaLinkId = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${linkId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(viaLinkId.statusCode).toBe(404);
  });

  it('omits trashed items from shared-with-me and suspends access (FR-010)', async () => {
    const box = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'TrashBox' });
    const grant = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: box.id, kind: 'user', recipientIds: [bob.id] },
    });
    const grantId = (grant.json() as { items: Array<{ id: string }> }).items[0]?.id as string;

    await t.app.inject({ method: 'DELETE', url: `/api/nodes/${box.id}`, headers: { cookie: aliceCookie } });

    const listing = await t.app.inject({ method: 'GET', url: '/api/shared-with-me', headers: { cookie: bobCookie } });
    const ids = (listing.json() as SharedWithMeBody).items.map((i) => i.shareId);
    expect(ids).not.toContain(grantId);

    const access = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${grantId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(access.statusCode).toBe(404);
  });

  it('revoking one recipient ends only that recipient\'s access (US2 #4, FR-007)', async () => {
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/shares/${bobShareId}`,
      headers: { cookie: aliceCookie },
    });
    expect(del.statusCode).toBe(204);

    const bobListing = await t.app.inject({ method: 'GET', url: '/api/shared-with-me', headers: { cookie: bobCookie } });
    const bobIds = (bobListing.json() as SharedWithMeBody).items.map((i) => i.shareId);
    expect(bobIds).not.toContain(bobShareId);

    const bobAccess = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(bobAccess.statusCode).toBe(404);

    // Carol's independent grant still works.
    const carolCookie = sessionCookieFor(t.app, t.services, carol.id);
    const carolAccess = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${carolShareId}/children`,
      headers: { cookie: carolCookie },
    });
    expect(carolAccess.statusCode).toBe(200);
  });

  it('serves a minimal user directory to any signed-in user (research.md §8)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; username: string; email: string | null }>;
    const names = body.map((u) => u.username).sort();
    // Active users minus the caller; the disabled account is absent.
    expect(names).toEqual(['alice', 'carol', 'trudy']);
    for (const u of body) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'username']);
    }

    const anon = await t.app.inject({ method: 'GET', url: '/api/users' });
    expect(anon.statusCode).toBe(401);
  });
});
