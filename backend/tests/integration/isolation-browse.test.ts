import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

/**
 * Isolation negative tests (T027, gating — Principle II). User A must never see,
 * list, stream, thumbnail, or search User B's nodes. Every cross-user access —
 * including id-guessing — must return the SAME uniform 404 as a missing node.
 */
describe('per-user isolation: browse (US1, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let aliceCookie: string;
  let bobFolder: NodeRow;
  let bobFile: NodeRow;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    bob = await seedUser(t.services, 'bob', 'bob-password-9', 'user');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);

    const bobRoot = rootId(t.services, bob.id);
    bobFolder = t.services.nodes.insertFolderNode({ ownerId: bob.id, parentId: bobRoot, name: 'BobSecrets' });
    bobFile = await seedFile(t.services, bob.id, bobRoot, 'bob-private.txt', Buffer.from('top secret'), 'text/plain');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  function expectUniform404(res: { statusCode: number; json: () => { error: { code: string } } }) {
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  }

  it("A cannot list B's folder children", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${bobFolder.id}/children`,
      headers: { cookie: aliceCookie },
    });
    expectUniform404(res);
  });

  it("A cannot stream B's file content", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${bobFile.id}/content`,
      headers: { cookie: aliceCookie },
    });
    expectUniform404(res);
  });

  it("A cannot fetch a thumbnail of B's file", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${bobFile.id}/thumbnail`,
      headers: { cookie: aliceCookie },
    });
    expectUniform404(res);
  });

  it("A's search never surfaces B's items", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?q=bob-private',
      headers: { cookie: aliceCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });

  it('id-guessing returns the same uniform 404 as a non-owned id', async () => {
    const guessed = await t.app.inject({
      method: 'GET',
      url: '/api/files/01ARZ3NDEKTSV4RRFFQ69G5FAV/content',
      headers: { cookie: aliceCookie },
    });
    const nonOwned = await t.app.inject({
      method: 'GET',
      url: `/api/files/${bobFile.id}/content`,
      headers: { cookie: aliceCookie },
    });
    expectUniform404(guessed);
    expectUniform404(nonOwned);
    expect(guessed.json()).toEqual(nonOwned.json());
  });
});
