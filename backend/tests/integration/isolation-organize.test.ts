import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, seedFile, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

/**
 * Isolation negative tests for organize/trash (T060, gating — Principle II). User
 * A must not be able to create-under, rename, move, delete, restore, or purge
 * User B's nodes. Every attempt returns a uniform 404, and B's tree is unchanged.
 */
describe('per-user isolation: organize/trash (US3, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let aliceCookie: string;
  let bFolder: NodeRow;
  let bFile: NodeRow;
  let bTrashRoot: NodeRow;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    bob = await seedUser(t.services, 'bob', 'bob-password-9', 'user');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);

    const bRoot = rootId(t.services, bob.id);
    bFolder = t.services.nodes.insertFolderNode({ ownerId: bob.id, parentId: bRoot, name: 'BobFolder' });
    bFile = await seedFile(t.services, bob.id, bRoot, 'bob.txt', Buffer.from('secret'), 'text/plain');
    const doomed = await seedFile(t.services, bob.id, bRoot, 'doomed.txt', Buffer.from('x'), 'text/plain');
    t.services.nodes.trashSubtree(bob.id, doomed.id, Date.now() + 1_000_000);
    bTrashRoot = doomed;
  });
  afterAll(async () => {
    await t.cleanup();
  });

  function asAlice(method: string, url: string, payload?: unknown) {
    return t.app.inject({ method: method as 'GET', url, headers: { cookie: aliceCookie }, payload: payload as object });
  }
  function expect404(res: { statusCode: number; json: () => { error: { code: string } } }) {
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  }

  it("A cannot create a folder under B's folder", async () => {
    expect404(await asAlice('POST', '/api/folders', { parentId: bFolder.id, name: 'x' }));
  });
  it("A cannot rename B's file", async () => {
    expect404(await asAlice('PATCH', `/api/nodes/${bFile.id}`, { name: 'hacked.txt' }));
  });
  it("A cannot move B's file into A's own root", async () => {
    expect404(await asAlice('PATCH', `/api/nodes/${bFile.id}`, { parentId: null }));
  });
  it("A cannot trash B's node", async () => {
    expect404(await asAlice('DELETE', `/api/nodes/${bFile.id}`));
  });
  it("A cannot restore B's trashed node", async () => {
    expect404(await asAlice('POST', `/api/trash/${bTrashRoot.id}/restore`));
  });
  it("A cannot purge B's trashed node", async () => {
    expect404(await asAlice('DELETE', `/api/trash/${bTrashRoot.id}?confirm=true`));
  });

  it("B's tree is unchanged after A's attempts", async () => {
    const bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    const list = await t.app.inject({ method: 'GET', url: '/api/folders/root/children?limit=100', headers: { cookie: bobCookie } });
    const names = list.json().items.map((n: { name: string }) => n.name);
    expect(names).toContain('BobFolder');
    expect(names).toContain('bob.txt');
    const trash = await t.app.inject({ method: 'GET', url: '/api/trash', headers: { cookie: bobCookie } });
    expect(trash.json().items.map((n: { name: string }) => n.name)).toContain('doomed.txt');
  });
});
