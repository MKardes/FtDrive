import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

/**
 * Constitution gate for 006-share-links (Principles I & II): the cross-user
 * probing matrix over every share surface, plus the share/lifecycle interplay
 * (rename/move persistence, trash suspend/restore, purge + account-removal
 * cascades). Every denial must be the SAME uniform 404 with no metadata.
 */

const UNIFORM_404 = JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } });

describe('share isolation matrix + lifecycle (006, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let mallory: UserRow;
  let aliceCookie: string;
  let bobCookie: string;
  let malloryCookie: string;
  let rid: string;
  let folder: NodeRow;
  let file: NodeRow;
  let token: string;
  let linkShareId: string;
  let bobShareId: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    bob = await seedUser(t.services, 'bob', 'bob-password');
    mallory = await seedUser(t.services, 'mallory', 'mallory-password');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);
    bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    malloryCookie = sessionCookieFor(t.app, t.services, mallory.id);
    rid = rootId(t.services, alice.id);

    folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Vault' });
    file = await seedFile(t.services, alice.id, folder.id, 'plan.txt', Buffer.from('the plan'), 'text/plain');

    const link = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: folder.id, kind: 'link' },
    });
    const linkBody = (link.json() as { items: Array<{ id: string; token: string }> }).items[0]!;
    token = linkBody.token;
    linkShareId = linkBody.id;

    const direct = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: folder.id, kind: 'user', recipientIds: [bob.id] },
    });
    bobShareId = (direct.json() as { items: Array<{ id: string }> }).items[0]!.id;
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('denies the full cross-user probing matrix with the identical uniform 404', async () => {
    const probes: Array<{
      method: 'GET' | 'PATCH' | 'DELETE';
      url: string;
      cookie?: string;
      payload?: Record<string, unknown>;
    }> = [
      // Mallory (signed in, no grant) probing Alice's share ids and content.
      { method: 'GET', url: `/api/shared/${bobShareId}/children`, cookie: malloryCookie },
      { method: 'GET', url: `/api/shared/${bobShareId}/files/${file.id}/content`, cookie: malloryCookie },
      { method: 'GET', url: `/api/shared/${bobShareId}/files/${file.id}/thumbnail`, cookie: malloryCookie },
      { method: 'GET', url: `/api/nodes/${folder.id}/shares`, cookie: malloryCookie },
      { method: 'PATCH', url: `/api/shares/${bobShareId}`, cookie: malloryCookie, payload: { expiresAt: null } },
      { method: 'DELETE', url: `/api/shares/${linkShareId}`, cookie: malloryCookie },
      // Bob (legitimate recipient) escaping his subtree or using the wrong kind.
      { method: 'GET', url: `/api/shared/${bobShareId}/children?nodeId=${rid}`, cookie: bobCookie },
      { method: 'GET', url: `/api/shared/${linkShareId}/children`, cookie: bobCookie },
      // Anonymous visitor with a valid token escaping the subtree.
      { method: 'GET', url: `/api/public/shares/${token}/children?nodeId=${rid}` },
      // Anonymous visitor with garbage tokens/ids.
      { method: 'GET', url: `/api/public/shares/${'z'.repeat(43)}` },
      { method: 'GET', url: `/api/public/shares/${token}/files/${'0'.repeat(26)}/content` },
    ];

    for (const probe of probes) {
      const res = await t.app.inject({
        method: probe.method,
        url: probe.url,
        headers: probe.cookie ? { cookie: probe.cookie } : {},
        payload: probe.payload,
      });
      expect(res.statusCode, `${probe.method} ${probe.url}`).toBe(404);
      expect(res.body, `${probe.method} ${probe.url}`).toBe(UNIFORM_404);
    }

    // Meanwhile the legitimate paths still work (the matrix broke nothing).
    const bobOk = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(bobOk.statusCode).toBe(200);
    const anonOk = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(anonOk.statusCode).toBe(200);
  });

  it('keeps shares attached across rename and move (FR-010)', async () => {
    const rename = await t.app.inject({
      method: 'PATCH',
      url: `/api/nodes/${folder.id}`,
      headers: { cookie: aliceCookie },
      payload: { name: 'Vault Renamed' },
    });
    expect(rename.statusCode).toBe(200);

    const other = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Elsewhere' });
    const move = await t.app.inject({
      method: 'PATCH',
      url: `/api/nodes/${folder.id}`,
      headers: { cookie: aliceCookie },
      payload: { parentId: other.id },
    });
    expect(move.statusCode).toBe(200);

    const pub = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(pub.statusCode).toBe(200);
    expect((pub.json() as { node: { name: string; parentId: string | null } }).node.name).toBe('Vault Renamed');
    // Even after the move, the shared root's real parent stays hidden.
    expect((pub.json() as { node: { parentId: string | null } }).node.parentId).toBeNull();

    const bobOk = await t.app.inject({
      method: 'GET',
      url: `/api/shared/${bobShareId}/children`,
      headers: { cookie: bobCookie },
    });
    expect(bobOk.statusCode).toBe(200);
  });

  it('suspends on trash, resumes on restore, and permanently ends on purge (FR-010)', async () => {
    const trash = await t.app.inject({
      method: 'DELETE',
      url: `/api/nodes/${folder.id}`,
      headers: { cookie: aliceCookie },
    });
    expect(trash.statusCode).toBe(204);

    for (const res of [
      await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` }),
      await t.app.inject({ method: 'GET', url: `/api/shared/${bobShareId}/children`, headers: { cookie: bobCookie } }),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe(UNIFORM_404);
    }

    const restore = await t.app.inject({
      method: 'POST',
      url: `/api/trash/${folder.id}/restore`,
      headers: { cookie: aliceCookie },
    });
    expect(restore.statusCode).toBe(200);

    // The SAME link works again after restore.
    const pub = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(pub.statusCode).toBe(200);

    // Purge permanently: grants cascade away with the node rows.
    await t.app.inject({ method: 'DELETE', url: `/api/nodes/${folder.id}`, headers: { cookie: aliceCookie } });
    const purge = await t.app.inject({
      method: 'DELETE',
      url: `/api/trash/${folder.id}?confirm=true`,
      headers: { cookie: aliceCookie },
    });
    expect(purge.statusCode).toBe(204);

    const afterPurge = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(afterPurge.statusCode).toBe(404);
    expect(afterPurge.body).toBe(UNIFORM_404);

    const mine = await t.app.inject({ method: 'GET', url: '/api/shares', headers: { cookie: aliceCookie } });
    const ids = (mine.json() as { items: Array<{ id: string }> }).items.map((s) => s.id);
    expect(ids).not.toContain(linkShareId);
    expect(ids).not.toContain(bobShareId);
  });

  it('removes a recipient\'s grants when their account is removed (edge case)', async () => {
    const doc = await seedFile(t.services, alice.id, rid, 'cascade.txt', Buffer.from('x'), 'text/plain');
    const grant = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: aliceCookie },
      payload: { nodeId: doc.id, kind: 'user', recipientIds: [mallory.id] },
    });
    const grantId = (grant.json() as { items: Array<{ id: string }> }).items[0]!.id;

    await t.services.users.deleteUser(mallory.id);

    const mine = await t.app.inject({ method: 'GET', url: '/api/shares', headers: { cookie: aliceCookie } });
    const ids = (mine.json() as { items: Array<{ id: string }> }).items.map((s) => s.id);
    expect(ids).not.toContain(grantId);
  });
});
