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
 * Consolidated cross-user isolation suite (T051, gating — Principle II, FR-010,
 * SC-002). Against EVERY endpoint built so far, User A using one of User B's ids
 * must get the SAME uniform 404 as a random id-guess — no existence, count, or
 * content disclosure. Search never surfaces another user's items.
 */
describe('consolidated cross-user isolation (US4, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let aliceCookie: string;
  let bFolder: NodeRow;
  let bFile: NodeRow;
  let bTrashRoot: NodeRow;
  const GUESS = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  beforeAll(async () => {
    t = await buildTestApp();
    // Owner provisions A and B; A is a plain user here (admin auth is role-gated,
    // separate from data isolation, which is what this suite proves).
    await seedUser(t.services, 'owner', 'owner-password', 'owner');
    alice = await seedUser(t.services, 'alice', 'alice-password', 'user');
    bob = await seedUser(t.services, 'bob', 'bob-password-9', 'user');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);

    const bRoot = rootId(t.services, bob.id);
    bFolder = t.services.nodes.insertFolderNode({ ownerId: bob.id, parentId: bRoot, name: 'BobOnly' });
    bFile = await seedFile(t.services, bob.id, bRoot, 'bob-secret.txt', Buffer.from('classified'), 'text/plain');
    // A trashed item owned by B (restore-root) to cover the trash endpoints.
    const doomed = await seedFile(t.services, bob.id, bRoot, 'bob-trashed.txt', Buffer.from('gone'), 'text/plain');
    t.services.nodes.trashSubtree(bob.id, doomed.id, Date.now() + 1_000_000);
    bTrashRoot = doomed;
  });
  afterAll(async () => {
    await t.cleanup();
  });

  async function asAlice(method: string, url: string, payload?: unknown) {
    return t.app.inject({ method: method as 'GET', url, headers: { cookie: aliceCookie }, payload: payload as object });
  }
  function code(res: { json: () => { error: { code: string } } }): string {
    return res.json().error.code;
  }

  it('every cross-user endpoint returns a uniform 404 (identical to an id-guess)', async () => {
    const cases: Array<{ name: string; real: () => Promise<{ statusCode: number; json: () => { error: { code: string } } }>; guess: () => Promise<{ statusCode: number; json: () => { error: { code: string } } }> }> = [
      { name: 'list children', real: () => asAlice('GET', `/api/folders/${bFolder.id}/children`), guess: () => asAlice('GET', `/api/folders/${GUESS}/children`) },
      { name: 'file content', real: () => asAlice('GET', `/api/files/${bFile.id}/content`), guess: () => asAlice('GET', `/api/files/${GUESS}/content`) },
      { name: 'thumbnail', real: () => asAlice('GET', `/api/files/${bFile.id}/thumbnail`), guess: () => asAlice('GET', `/api/files/${GUESS}/thumbnail`) },
      { name: 'create folder under', real: () => asAlice('POST', '/api/folders', { parentId: bFolder.id, name: 'x' }), guess: () => asAlice('POST', '/api/folders', { parentId: GUESS, name: 'x' }) },
      { name: 'rename/move', real: () => asAlice('PATCH', `/api/nodes/${bFile.id}`, { name: 'hacked.txt' }), guess: () => asAlice('PATCH', `/api/nodes/${GUESS}`, { name: 'hacked.txt' }) },
      { name: 'trash', real: () => asAlice('DELETE', `/api/nodes/${bFile.id}`), guess: () => asAlice('DELETE', `/api/nodes/${GUESS}`) },
      { name: 'restore', real: () => asAlice('POST', `/api/trash/${bTrashRoot.id}/restore`), guess: () => asAlice('POST', `/api/trash/${GUESS}/restore`) },
      { name: 'purge', real: () => asAlice('DELETE', `/api/trash/${bTrashRoot.id}?confirm=true`), guess: () => asAlice('DELETE', `/api/trash/${GUESS}?confirm=true`) },
    ];

    for (const c of cases) {
      const real = await c.real();
      const guess = await c.guess();
      expect(real.statusCode, `${c.name}: real id`).toBe(404);
      expect(guess.statusCode, `${c.name}: guessed id`).toBe(404);
      expect(code(real), `${c.name}: code`).toBe('NOT_FOUND');
      expect(real.json(), `${c.name}: identical body`).toEqual(guess.json());
    }
  });

  it("A cannot upload into B's folder (uniform 404)", async () => {
    const res = await uploadFile(t.app, aliceCookie, bFolder.id, 'x.txt', Buffer.from('x'), 'text/plain');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it("A's search and trash listing never include B's items", async () => {
    const search = await asAlice('GET', '/api/search?q=bob-secret');
    expect(search.statusCode).toBe(200);
    expect(search.json().items).toHaveLength(0);

    const trash = await asAlice('GET', '/api/trash');
    expect(trash.statusCode).toBe(200);
    expect(trash.json().items).toHaveLength(0);
  });

  it("B's data is intact after A's probing", async () => {
    const bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    const content = await t.app.inject({ method: 'GET', url: `/api/files/${bFile.id}/content`, headers: { cookie: bobCookie } });
    expect(content.statusCode).toBe(200);
    expect(content.body).toBe('classified');
  });
});
