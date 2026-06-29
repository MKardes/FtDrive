import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  seedUser,
  seedFile,
  sessionCookieFor,
  rootId,
  uploadFile,
  type TestApp,
} from '../fixtures/app';
import type { NodeRow, UserRow } from '../../src/db/schema';

/**
 * Isolation negative tests for files (T042, gating — Principle II). User A must
 * not be able to upload into, or download from, User B's nodes. Every cross-user
 * id (including a random guess) returns the SAME uniform 404.
 */
describe('per-user isolation: files (US2, gating)', () => {
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
    bobFolder = t.services.nodes.insertFolderNode({
      ownerId: bob.id,
      parentId: bobRoot,
      name: 'BobFolder',
    });
    bobFile = await seedFile(t.services, bob.id, bobRoot, 'bob.txt', Buffer.from('secret'), 'text/plain');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  function expectUniform404(res: { statusCode: number; json: () => { error: { code: string } } }) {
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  }

  it("A cannot upload into B's folder", async () => {
    const res = await uploadFile(
      t.app,
      aliceCookie,
      bobFolder.id,
      'intrusion.txt',
      Buffer.from('nope'),
      'text/plain',
    );
    expectUniform404(res);
  });

  it("A cannot upload into a guessed id (same 404 as B's real folder)", async () => {
    const res = await uploadFile(
      t.app,
      aliceCookie,
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      'intrusion.txt',
      Buffer.from('nope'),
      'text/plain',
    );
    expectUniform404(res);
  });

  it("A cannot download B's file", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${bobFile.id}/content`,
      headers: { cookie: aliceCookie },
    });
    expectUniform404(res);
  });

  it("B's blob is untouched after A's failed upload attempts", async () => {
    const bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${bobFile.id}/content`,
      headers: { cookie: bobCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('secret');
  });
});
