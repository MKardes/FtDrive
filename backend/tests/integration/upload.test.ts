import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  seedUser,
  sessionCookieFor,
  rootId,
  uploadFile,
  type TestApp,
} from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Upload integration (T040, FR-004/013/014). Covers atomic commit + download
 * byte-identity, keep-both name collisions, the size limit (413), and that
 * several concurrent uploads into one folder all land without corrupting the
 * listing (Edge Case: concurrent edits).
 */
describe('upload / download (US2)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;
  let rid: string;

  beforeAll(async () => {
    t = await buildTestApp({ maxUploadBytes: 4096 });
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
    rid = rootId(t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('uploads a file (201) and downloads it byte-for-byte', async () => {
    const bytes = Buffer.from('the quick brown fox\n'.repeat(8));
    const up = await uploadFile(t.app, cookie, 'root', 'fox.txt', bytes, 'text/plain');
    expect(up.statusCode).toBe(201);
    const node = up.json();
    expect(node.name).toBe('fox.txt');
    expect(node.size).toBe(bytes.length);
    expect(node.type).toBe('file');

    const dl = await t.app.inject({
      method: 'GET',
      url: `/api/files/${node.id}/content`,
      headers: { cookie },
    });
    expect(dl.statusCode).toBe(200);
    expect(Buffer.from(dl.rawPayload)).toEqual(bytes);
  });

  it('keeps both on a name collision (FR-013)', async () => {
    const first = await uploadFile(t.app, cookie, rid, 'dup.txt', Buffer.from('one'), 'text/plain');
    const second = await uploadFile(t.app, cookie, rid, 'dup.txt', Buffer.from('two'), 'text/plain');
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().name).toBe('dup.txt');
    expect(second.json().name).toBe('dup (2).txt');
  });

  it('rejects an over-size upload with 413', async () => {
    const big = Buffer.alloc(8192, 0x61); // 8 KiB > 4 KiB limit
    const res = await uploadFile(t.app, cookie, 'root', 'big.bin', big, 'application/octet-stream');
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('handles concurrent uploads into one folder without corrupting the listing', async () => {
    const folder = t.services.nodes.insertFolderNode({
      ownerId: alice.id,
      parentId: rid,
      name: 'Concurrent',
    });
    const uploads = Array.from({ length: 6 }, (_, i) =>
      uploadFile(t.app, cookie, folder.id, `c-${i}.txt`, Buffer.from(`payload ${i}`), 'text/plain'),
    );
    const results = await Promise.all(uploads);
    expect(results.every((r) => r.statusCode === 201)).toBe(true);

    const list = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${folder.id}/children?limit=100`,
      headers: { cookie },
    });
    const names = list.json().items.map((n: { name: string }) => n.name);
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(6); // all distinct, none lost or duplicated
  });
});
