import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, seedFile, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Organize: create / rename / move (T058, FR-006/013). Destination must be an
 * owned folder; a move that would create a cycle is rejected (409); name
 * collisions keep both. Concurrent renames/moves into one folder stay consistent
 * under the partial-unique index (Edge Case: concurrent edits).
 */
describe('organize: create / rename / move (US3)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;
  let rid: string;

  beforeAll(async () => {
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

  it('creates a folder (201) at root', async () => {
    const res = await inject('POST', '/api/folders', { parentId: null, name: 'Documents' });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe('folder');
    expect(res.json().name).toBe('Documents');
  });

  it('keeps both when a folder name collides', async () => {
    const a = await inject('POST', '/api/folders', { parentId: null, name: 'Dup' });
    const b = await inject('POST', '/api/folders', { parentId: null, name: 'Dup' });
    expect(a.json().name).toBe('Dup');
    expect(b.json().name).toBe('Dup (2)');
  });

  it('renames a file, keeping both on collision', async () => {
    const f1 = await seedFile(t.services, alice.id, rid, 'a.txt', Buffer.from('a'), 'text/plain');
    await seedFile(t.services, alice.id, rid, 'b.txt', Buffer.from('b'), 'text/plain');
    const res = await inject('PATCH', `/api/nodes/${f1.id}`, { name: 'b.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('b (2).txt');
  });

  it('moves a file into a folder', async () => {
    const folder = await inject('POST', '/api/folders', { parentId: null, name: 'Target' });
    const fid = folder.json().id;
    const file = await seedFile(t.services, alice.id, rid, 'movable.txt', Buffer.from('m'), 'text/plain');
    const res = await inject('PATCH', `/api/nodes/${file.id}`, { parentId: fid });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentId).toBe(fid);

    const list = await inject('GET', `/api/folders/${fid}/children`);
    expect(list.json().items.map((n: { name: string }) => n.name)).toContain('movable.txt');
  });

  it('rejects moving a folder into its own descendant with 409 (cycle)', async () => {
    const parent = await inject('POST', '/api/folders', { parentId: null, name: 'P' });
    const child = await inject('POST', '/api/folders', { parentId: parent.json().id, name: 'C' });
    const res = await inject('PATCH', `/api/nodes/${parent.json().id}`, { parentId: child.json().id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('rejects a destination that is not a folder (404)', async () => {
    const file = await seedFile(t.services, alice.id, rid, 'dest-not-folder.txt', Buffer.from('x'), 'text/plain');
    const other = await seedFile(t.services, alice.id, rid, 'to-move.txt', Buffer.from('y'), 'text/plain');
    const res = await inject('PATCH', `/api/nodes/${other.id}`, { parentId: file.id });
    expect(res.statusCode).toBe(404);
  });

  it('keeps concurrent moves into one folder consistent', async () => {
    const dest = await inject('POST', '/api/folders', { parentId: null, name: 'Bucket' });
    const did = dest.json().id;
    const files = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        seedFile(t.services, alice.id, rid, `mv-${i}.txt`, Buffer.from(String(i)), 'text/plain'),
      ),
    );
    const moves = await Promise.all(files.map((f) => inject('PATCH', `/api/nodes/${f.id}`, { parentId: did })));
    expect(moves.every((r) => r.statusCode === 200)).toBe(true);

    const list = await inject('GET', `/api/folders/${did}/children?limit=100`);
    const names = list.json().items.map((n: { name: string }) => n.name);
    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(5);
  });
});
