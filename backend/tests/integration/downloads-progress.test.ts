import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** `GET /downloads` reflects advancing bytesDownloaded/totalBytes for an active download (T033). */
describe('downloads: live progress (US2)', () => {
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

  it('shows increasing bytesDownloaded while downloading, reaching completed', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/slow' },
    });
    const id = create.json().id;

    const seenBytes: number[] = [];
    const deadline = Date.now() + 10_000;
    let finalStatus = '';
    while (Date.now() < deadline) {
      const res = await t.app.inject({ method: 'GET', url: `/api/downloads/${id}`, headers: { cookie } });
      const body = res.json();
      seenBytes.push(body.bytesDownloaded);
      finalStatus = body.status;
      if (finalStatus === 'completed' || finalStatus === 'failed') break;
      await new Promise((r) => setTimeout(r, 40));
    }

    expect(finalStatus).toBe('completed');
    // Bytes should be non-decreasing and actually increase at some point.
    const increased = seenBytes.some((v, i) => i > 0 && v > (seenBytes[i - 1] as number));
    expect(increased).toBe(true);
    for (let i = 1; i < seenBytes.length; i++) {
      expect(seenBytes[i]).toBeGreaterThanOrEqual(seenBytes[i - 1] as number);
    }
  });
});
