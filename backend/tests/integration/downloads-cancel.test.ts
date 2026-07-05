import { readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, rootId, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** Cancel discards partial data and creates no node/temp (FR-008, T034, gating atomicity). */
describe('downloads: cancel (US2, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('cancelling mid-download leaves no node and no leftover temp file', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/slow' },
    });
    const id = create.json().id;

    // Wait until it's actually mid-transfer before cancelling.
    const deadline = Date.now() + 5000;
    let downloading = false;
    while (Date.now() < deadline) {
      const res = await t.app.inject({ method: 'GET', url: `/api/downloads/${id}`, headers: { cookie } });
      if (res.json().status === 'downloading') {
        downloading = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(downloading).toBe(true);

    const cancelRes = await t.app.inject({ method: 'POST', url: `/api/downloads/${id}/cancel`, headers: { cookie } });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe('canceled');

    const final = await pollUntilTerminal(t.app, cookie, id);
    expect(final.status).toBe('canceled');
    expect(final.nodeId).toBeNull();

    // No file node was ever added to the drive — the "Downloads" folder may
    // exist (it's created up front so a size/destination check can run before
    // any bytes are fetched) but must be empty.
    const listing = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${rootId(t.services, alice.id)}/children`,
      headers: { cookie },
    });
    const rootItems = listing.json().items as Array<{ id: string; name: string; type: string }>;
    expect(rootItems.every((n) => n.type === 'folder')).toBe(true);
    for (const folder of rootItems) {
      const inside = await t.app.inject({
        method: 'GET',
        url: `/api/folders/${folder.id}/children`,
        headers: { cookie },
      });
      expect(inside.json().items).toHaveLength(0);
    }

    // No leftover scratch temp file for this job.
    await new Promise((r) => setTimeout(r, 100)); // let the abort's discardTemp settle
    const tmpDir = t.services.storage.tmpDir(alice.id);
    let entries: string[] = [];
    try {
      entries = await readdir(tmpDir);
    } catch {
      entries = [];
    }
    expect(entries.filter((f) => f.includes(id))).toHaveLength(0);
  });

  it('cancelling an already-terminal download returns 409', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/ok' },
    });
    const id = create.json().id;
    await pollUntilTerminal(t.app, cookie, id);

    const res = await t.app.inject({ method: 'POST', url: `/api/downloads/${id}/cancel`, headers: { cookie } });
    expect(res.statusCode).toBe(409);
  });
});
