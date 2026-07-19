import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

interface ShareBody {
  id: string;
  nodeId: string;
  kind: string;
  token?: string;
  recipient?: { id: string; username: string };
  createdAt: number;
  expiresAt: number | null;
  node?: { id: string; name: string; type: string };
}

describe('owner share management (US1 link shares, FR-001/006/007/009/013)', () => {
  let t: TestApp;
  let alice: UserRow;
  let mallory: UserRow;
  let cookie: string;
  let malloryCookie: string;
  let rid: string;
  let file: NodeRow;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    mallory = await seedUser(t.services, 'mallory', 'mallory-password');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
    malloryCookie = sessionCookieFor(t.app, t.services, mallory.id);
    rid = rootId(t.services, alice.id);
    file = await seedFile(t.services, alice.id, rid, 'doc.txt', Buffer.from('doc'), 'text/plain');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('requires a session for all management endpoints (Principle I)', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      payload: { nodeId: file.id, kind: 'link' },
    });
    expect(create.statusCode).toBe(401);
    const list = await t.app.inject({ method: 'GET', url: `/api/nodes/${file.id}/shares` });
    expect(list.statusCode).toBe(401);
    const del = await t.app.inject({ method: 'DELETE', url: '/api/shares/nope' });
    expect(del.statusCode).toBe(401);
  });

  it('creates a link share and surfaces the SAME grant on repeat (FR-013)', async () => {
    const first = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    expect(first.statusCode).toBe(201);
    const a = (first.json() as { items: ShareBody[] }).items[0] as ShareBody;
    expect(a.kind).toBe('link');
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.expiresAt).toBeNull();

    const again = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    expect(again.statusCode).toBe(201);
    const b = (again.json() as { items: ShareBody[] }).items[0] as ShareBody;
    expect(b.id).toBe(a.id);
    expect(b.token).toBe(a.token);
  });

  it('lists a node\'s shares from the item (FR-006)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/nodes/${file.id}/shares`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: ShareBody[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('link');
    expect(items[0]?.node).toEqual({ id: file.id, name: 'doc.txt', type: 'file' });
  });

  it('revokes a share; revocation is immediate (FR-007)', async () => {
    const listing = await t.app.inject({
      method: 'GET',
      url: `/api/nodes/${file.id}/shares`,
      headers: { cookie },
    });
    const share = (listing.json() as { items: ShareBody[] }).items[0] as ShareBody;

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/shares/${share.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const pub = await t.app.inject({ method: 'GET', url: `/api/public/shares/${share.token}` });
    expect(pub.statusCode).toBe(404);

    const after = await t.app.inject({
      method: 'GET',
      url: `/api/nodes/${file.id}/shares`,
      headers: { cookie },
    });
    expect((after.json() as { items: ShareBody[] }).items).toHaveLength(0);
  });

  it('answers foreign/nonexistent nodes and shares with the uniform 404 (FR-009)', async () => {
    // Mallory tries to share Alice's file.
    const createForeign = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: malloryCookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    expect(createForeign.statusCode).toBe(404);

    // Mallory tries to read/revoke Alice's share.
    const mine = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    const share = (mine.json() as { items: ShareBody[] }).items[0] as ShareBody;

    const foreignList = await t.app.inject({
      method: 'GET',
      url: `/api/nodes/${file.id}/shares`,
      headers: { cookie: malloryCookie },
    });
    expect(foreignList.statusCode).toBe(404);

    const foreignDelete = await t.app.inject({
      method: 'DELETE',
      url: `/api/shares/${share.id}`,
      headers: { cookie: malloryCookie },
    });
    expect(foreignDelete.statusCode).toBe(404);

    // And the share still works for its owner (nothing leaked, nothing broken).
    const pub = await t.app.inject({ method: 'GET', url: `/api/public/shares/${share.token}` });
    expect(pub.statusCode).toBe(200);

    // Nonexistent ids: same uniform 404.
    const missingNode = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: '01JUNKJUNKJUNKJUNKJUNKJUNK', kind: 'link' },
    });
    expect(missingNode.statusCode).toBe(404);
    expect(missingNode.body).toBe(createForeign.body);

    const missingShare = await t.app.inject({
      method: 'DELETE',
      url: '/api/shares/01JUNKJUNKJUNKJUNKJUNKJUNK',
      headers: { cookie },
    });
    expect(missingShare.statusCode).toBe(404);
  });

  it('lists ALL of the owner\'s grants with node info, newest first (US3, FR-006)', async () => {
    const folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Overview' });
    await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: folder.id, kind: 'user', recipientIds: [mallory.id] },
    });

    const res = await t.app.inject({ method: 'GET', url: '/api/shares', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: ShareBody[] }).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Newest first; every row carries its node summary.
    const created = items.map((s) => s.createdAt);
    expect([...created].sort((a, b) => b - a)).toEqual(created);
    for (const s of items) expect(s.node).toBeDefined();
    const direct = items.find((s) => s.kind === 'user' && s.node?.id === folder.id);
    expect(direct?.recipient?.username).toBe('mallory');

    // Mallory's own overview contains none of Alice's grants.
    const foreign = await t.app.inject({ method: 'GET', url: '/api/shares', headers: { cookie: malloryCookie } });
    expect((foreign.json() as { items: ShareBody[] }).items).toHaveLength(0);
  });

  it('sets, changes, and clears expiry; past timestamps are rejected (US3, FR-008)', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    const share = (create.json() as { items: ShareBody[] }).items[0] as ShareBody;

    const future = Date.now() + 60_000;
    const set = await t.app.inject({
      method: 'PATCH',
      url: `/api/shares/${share.id}`,
      headers: { cookie },
      payload: { expiresAt: future },
    });
    expect(set.statusCode).toBe(200);
    expect((set.json() as ShareBody).expiresAt).toBe(future);

    const past = await t.app.inject({
      method: 'PATCH',
      url: `/api/shares/${share.id}`,
      headers: { cookie },
      payload: { expiresAt: Date.now() - 1_000 },
    });
    expect(past.statusCode).toBe(400);

    const clear = await t.app.inject({
      method: 'PATCH',
      url: `/api/shares/${share.id}`,
      headers: { cookie },
      payload: { expiresAt: null },
    });
    expect(clear.statusCode).toBe(200);
    expect((clear.json() as ShareBody).expiresAt).toBeNull();

    // Foreign share: uniform 404.
    const foreign = await t.app.inject({
      method: 'PATCH',
      url: `/api/shares/${share.id}`,
      headers: { cookie: malloryCookie },
      payload: { expiresAt: future },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('treats an expired grant as revoked on every surface, before any sweep (US3, FR-008/012)', async () => {
    // Link share.
    const linkCreate = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'link' },
    });
    const link = (linkCreate.json() as { items: ShareBody[] }).items[0] as ShareBody;

    // Direct share to mallory.
    const directCreate = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'user', recipientIds: [mallory.id] },
    });
    const direct = (directCreate.json() as { items: ShareBody[] }).items[0] as ShareBody;

    // Force both past their expiry (bypassing route validation on purpose).
    t.services.shares.updateExpiry(alice.id, link.id, Date.now() - 1_000);
    t.services.shares.updateExpiry(alice.id, direct.id, Date.now() - 1_000);

    const pub = await t.app.inject({ method: 'GET', url: `/api/public/shares/${link.token}` });
    expect(pub.statusCode).toBe(404);

    const asRecipient = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${direct.id}/files/${file.id}/content`,
      headers: { cookie: sessionCookieFor(t.app, t.services, mallory.id) },
    });
    expect(asRecipient.statusCode).toBe(404);

    const listing = await t.app.inject({
      method: 'GET',
      url: '/api/shared-with-me',
      headers: { cookie: sessionCookieFor(t.app, t.services, mallory.id) },
    });
    const ids = (listing.json() as { items: Array<{ shareId: string }> }).items.map((i) => i.shareId);
    expect(ids).not.toContain(direct.id);

    // The maintenance sweep hard-deletes the dead rows.
    const removed = t.services.shares.deleteExpired(Date.now());
    expect(removed).toBeGreaterThanOrEqual(2);
    const after = await t.app.inject({ method: 'GET', url: `/api/nodes/${file.id}/shares`, headers: { cookie } });
    const remaining = (after.json() as { items: ShareBody[] }).items.map((s) => s.id);
    expect(remaining).not.toContain(link.id);
    expect(remaining).not.toContain(direct.id);
  });

  it('rejects malformed bodies with 400, never 500', async () => {
    const badKind = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { nodeId: file.id, kind: 'carrier-pigeon' },
    });
    expect(badKind.statusCode).toBe(400);

    const noNode = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie },
      payload: { kind: 'link' },
    });
    expect(noNode.statusCode).toBe(400);
  });
});
