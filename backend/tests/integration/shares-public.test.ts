import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

async function pngBytes(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: '#cc6633' } })
    .png()
    .toBuffer();
}

/** Create a link share via the API and return its token. */
async function createLink(t: TestApp, cookie: string, nodeId: string): Promise<{ id: string; token: string }> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/shares',
    headers: { cookie },
    payload: { nodeId, kind: 'link' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { items: Array<{ id: string; token: string }> };
  expect(body.items).toHaveLength(1);
  return body.items[0] as { id: string; token: string };
}

describe('anonymous open-link access (US1, FR-002/003/012)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;
  let rid: string;
  let folder: NodeRow;
  let sub: NodeRow;
  let fileInFolder: NodeRow;
  let fileInSub: NodeRow;
  let fileOutside: NodeRow;
  let imageInFolder: NodeRow;
  let folderToken: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
    rid = rootId(t.services, alice.id);

    folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Album' });
    sub = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: folder.id, name: 'Nested' });
    fileInFolder = await seedFile(t.services, alice.id, folder.id, 'inside.txt', Buffer.from('hello world'), 'text/plain');
    fileInSub = await seedFile(t.services, alice.id, sub.id, 'deep.txt', Buffer.from('deep bytes'), 'text/plain');
    fileOutside = await seedFile(t.services, alice.id, rid, 'private.txt', Buffer.from('secret'), 'text/plain');
    imageInFolder = await seedFile(t.services, alice.id, folder.id, 'pic.png', await pngBytes(), 'image/png');

    folderToken = (await createLink(t, cookie, folder.id)).token;
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('generates unguessable tokens (256-bit base64url)', () => {
    expect(folderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('resolves a folder link anonymously with the root parentId nulled', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/public/shares/${folderToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { node: { id: string; name: string; type: string; parentId: string | null } };
    expect(body.node.id).toBe(folder.id);
    expect(body.node.name).toBe('Album');
    expect(body.node.type).toBe('folder');
    expect(body.node.parentId).toBeNull();
  });

  it('lists the shared folder and navigates into subfolders anonymously (FR-002)', async () => {
    const top = await t.app.inject({ method: 'GET', url: `/api/public/shares/${folderToken}/children` });
    expect(top.statusCode).toBe(200);
    const names = (top.json() as { items: Array<{ name: string }> }).items.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['Nested', 'inside.txt', 'pic.png']));
    expect(names).not.toContain('private.txt');

    const nested = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/children?nodeId=${sub.id}`,
    });
    expect(nested.statusCode).toBe(200);
    const nestedNames = (nested.json() as { items: Array<{ name: string }> }).items.map((n) => n.name);
    expect(nestedNames).toEqual(['deep.txt']);
  });

  it('downloads file content anonymously, with Range/206 for seeking', async () => {
    const full = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${fileInFolder.id}/content`,
    });
    expect(full.statusCode).toBe(200);
    expect(full.body).toBe('hello world');

    const deep = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${fileInSub.id}/content`,
    });
    expect(deep.statusCode).toBe(200);
    expect(deep.body).toBe('deep bytes');

    const range = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${fileInFolder.id}/content`,
      headers: { range: 'bytes=0-4' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.body).toBe('hello');
    expect(range.headers['content-range']).toBe('bytes 0-4/11');

    const bad = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${fileInFolder.id}/content`,
      headers: { range: 'bytes=999-' },
    });
    expect(bad.statusCode).toBe(416);
  });

  it('serves thumbnails anonymously for media inside the share', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${imageInFolder.id}/thumbnail`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });

  it('denies anything outside the shared subtree with the uniform 404 (FR-003)', async () => {
    // A real file of the same owner, outside the shared folder.
    const content = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/files/${fileOutside.id}/content`,
    });
    expect(content.statusCode).toBe(404);

    // Listing an out-of-subtree folder (the owner's root is an ancestor, not a descendant).
    const listing = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/children?nodeId=${rid}`,
    });
    expect(listing.statusCode).toBe(404);

    // 'root' resolves to the SHARED root, never the owner's drive root.
    const viaRootAlias = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${folderToken}/children?nodeId=root`,
    });
    expect(viaRootAlias.statusCode).toBe(200);
    const names = (viaRootAlias.json() as { items: Array<{ name: string }> }).items.map((n) => n.name);
    expect(names).not.toContain('private.txt');
  });

  it('shares a single file: resolves and downloads, but never lists (uniform 404)', async () => {
    const { token } = await createLink(t, cookie, fileOutside.id);

    const info = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(info.statusCode).toBe(200);
    expect((info.json() as { node: { name: string } }).node.name).toBe('private.txt');

    const content = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${token}/files/${fileOutside.id}/content`,
    });
    expect(content.statusCode).toBe(200);
    expect(content.body).toBe('secret');

    const children = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}/children` });
    expect(children.statusCode).toBe(404);
  });

  it('answers invalid, revoked, and expired tokens with byte-identical 404s (FR-012)', async () => {
    const invalid = await t.app.inject({
      method: 'GET',
      url: `/api/public/shares/${'x'.repeat(43)}`,
    });
    expect(invalid.statusCode).toBe(404);

    // Revoked: create + revoke a link on a scratch file.
    const scratch = await seedFile(t.services, alice.id, rid, 'scratch.txt', Buffer.from('x'), 'text/plain');
    const revoked = await createLink(t, cookie, scratch.id);
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/shares/${revoked.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    const afterRevoke = await t.app.inject({ method: 'GET', url: `/api/public/shares/${revoked.token}` });
    expect(afterRevoke.statusCode).toBe(404);

    // Expired: create, then force the expiry into the past.
    const expiring = await createLink(t, cookie, scratch.id);
    t.services.shares.updateExpiry(alice.id, expiring.id, Date.now() - 1_000);
    const afterExpiry = await t.app.inject({ method: 'GET', url: `/api/public/shares/${expiring.token}` });
    expect(afterExpiry.statusCode).toBe(404);

    // Indistinguishable: identical status and body for all three.
    expect(afterRevoke.body).toBe(invalid.body);
    expect(afterExpiry.body).toBe(invalid.body);
  });

  it('suspends link access while the shared item is in Trash and resumes on restore (FR-010)', async () => {
    const box = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Box' });
    await seedFile(t.services, alice.id, box.id, 'boxed.txt', Buffer.from('boxed'), 'text/plain');
    const { token } = await createLink(t, cookie, box.id);

    const trash = await t.app.inject({ method: 'DELETE', url: `/api/nodes/${box.id}`, headers: { cookie } });
    expect(trash.statusCode).toBe(204);
    const whileTrashed = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(whileTrashed.statusCode).toBe(404);

    const restore = await t.app.inject({
      method: 'POST',
      url: `/api/trash/${box.id}/restore`,
      headers: { cookie },
    });
    expect(restore.statusCode).toBe(200);
    const afterRestore = await t.app.inject({ method: 'GET', url: `/api/public/shares/${token}` });
    expect(afterRestore.statusCode).toBe(200);
  });
});

describe('open-link guessing is throttled per IP (FR-014)', () => {
  it('rate-limits repeated public share lookups with 429', async () => {
    const t = await buildTestApp();
    try {
      let limited = false;
      for (let i = 0; i < 130; i += 1) {
        const res = await t.app.inject({
          method: 'GET',
          url: `/api/public/shares/${'g'.repeat(42)}${i % 10}`,
        });
        if (res.statusCode === 429) {
          limited = true;
          break;
        }
        expect(res.statusCode).toBe(404);
      }
      expect(limited).toBe(true);
    } finally {
      await t.cleanup();
    }
  });
});
