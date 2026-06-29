import { existsSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, seedFile, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import { runRetentionSweep } from '../../src/modules/trash/sweep';
import type { UserRow } from '../../src/db/schema';

/**
 * Trash lifecycle (T059, FR-007/008, SC-009). Delete trashes a subtree together;
 * restore brings it back to the original location (or root if that parent is
 * gone) with collision handling; purge/empty are permanent and require confirm;
 * the retention sweep removes expired items + their blobs.
 */
describe('trash / restore / purge / retention (US3)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;
  let rid: string;

  beforeEach(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
    rid = rootId(t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  function inject(method: string, url: string, payload?: unknown) {
    return t.app.inject({ method: method as 'GET', url, headers: { cookie }, payload: payload as object });
  }

  it('trashes a folder subtree together and lists only the deleted root', async () => {
    const folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Album' });
    await seedFile(t.services, alice.id, folder.id, 'inside.txt', Buffer.from('hi'), 'text/plain');

    const del = await inject('DELETE', `/api/nodes/${folder.id}`);
    expect(del.statusCode).toBe(204);

    // Gone from the live listing.
    const rootList = await inject('GET', '/api/folders/root/children');
    expect(rootList.json().items.map((n: { name: string }) => n.name)).not.toContain('Album');

    // Trash shows the deleted root only (not its descendants).
    const trash = await inject('GET', '/api/trash');
    const trashNames = trash.json().items.map((n: { name: string }) => n.name);
    expect(trashNames).toContain('Album');
    expect(trashNames).not.toContain('inside.txt');
  });

  it('restores a subtree back to its original location, together', async () => {
    const folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Album' });
    await seedFile(t.services, alice.id, folder.id, 'inside.txt', Buffer.from('hi'), 'text/plain');
    await inject('DELETE', `/api/nodes/${folder.id}`);

    const restore = await inject('POST', `/api/trash/${folder.id}/restore`);
    expect(restore.statusCode).toBe(200);
    expect(restore.json().parentId).toBe(rid);

    const rootList = await inject('GET', '/api/folders/root/children');
    expect(rootList.json().items.map((n: { name: string }) => n.name)).toContain('Album');
    const inner = await inject('GET', `/api/folders/${folder.id}/children`);
    expect(inner.json().items.map((n: { name: string }) => n.name)).toContain('inside.txt');
  });

  it('keeps both when restoring into a name that was re-taken', async () => {
    const file = await seedFile(t.services, alice.id, rid, 'photo.jpg', Buffer.from('a'), 'image/jpeg');
    await inject('DELETE', `/api/nodes/${file.id}`);
    // Re-create a live file with the same name while the original sits in trash.
    await seedFile(t.services, alice.id, rid, 'photo.jpg', Buffer.from('b'), 'image/jpeg');

    const restore = await inject('POST', `/api/trash/${file.id}/restore`);
    expect(restore.statusCode).toBe(200);
    expect(restore.json().name).toBe('photo (2).jpg');
  });

  it('restores to root when the original parent is gone', async () => {
    const folder = t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'P' });
    const file = await seedFile(t.services, alice.id, folder.id, 'orphan.txt', Buffer.from('o'), 'text/plain');
    // Trash the file first (original parent = P), then trash P itself.
    await inject('DELETE', `/api/nodes/${file.id}`);
    await inject('DELETE', `/api/nodes/${folder.id}`);

    const restore = await inject('POST', `/api/trash/${file.id}/restore`);
    expect(restore.statusCode).toBe(200);
    expect(restore.json().parentId).toBe(rid); // fell back to root
  });

  it('requires confirm to purge a single item, then removes its blob', async () => {
    const file = await seedFile(t.services, alice.id, rid, 'purge-me.txt', Buffer.from('bytes'), 'text/plain');
    const storagePath = file.storagePath as string;
    expect(existsSync(t.services.storage.blobAbsPath(alice.id, storagePath))).toBe(true);
    await inject('DELETE', `/api/nodes/${file.id}`);

    const noConfirm = await inject('DELETE', `/api/trash/${file.id}`);
    expect(noConfirm.statusCode).toBe(400);

    const purge = await inject('DELETE', `/api/trash/${file.id}?confirm=true`);
    expect(purge.statusCode).toBe(204);
    expect(existsSync(t.services.storage.blobAbsPath(alice.id, storagePath))).toBe(false);
    expect(t.services.nodes.getOwnedNode(alice.id, file.id)).toBeUndefined();
  });

  it('requires confirm to empty the whole trash', async () => {
    const f1 = await seedFile(t.services, alice.id, rid, 'e1.txt', Buffer.from('1'), 'text/plain');
    const f2 = await seedFile(t.services, alice.id, rid, 'e2.txt', Buffer.from('2'), 'text/plain');
    await inject('DELETE', `/api/nodes/${f1.id}`);
    await inject('DELETE', `/api/nodes/${f2.id}`);

    const noConfirm = await inject('DELETE', '/api/trash');
    expect(noConfirm.statusCode).toBe(400);

    const empty = await inject('DELETE', '/api/trash?confirm=true');
    expect(empty.statusCode).toBe(204);
    const trash = await inject('GET', '/api/trash');
    expect(trash.json().items).toHaveLength(0);
  });

  it('the retention sweep permanently removes expired trash', async () => {
    const file = await seedFile(t.services, alice.id, rid, 'expired.txt', Buffer.from('old'), 'text/plain');
    // Trash with a deadline already in the past.
    t.services.nodes.trashSubtree(alice.id, file.id, Date.now() - 1000);

    const removed = await runRetentionSweep(t.services);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(t.services.nodes.getOwnedNode(alice.id, file.id)).toBeUndefined();
    const trash = await inject('GET', '/api/trash');
    expect(trash.json().items).toHaveLength(0);
  });
});
