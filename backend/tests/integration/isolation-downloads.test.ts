import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Cross-user isolation for downloads (T036, gating — Principle II, FR-012,
 * SC-005): user A gets the SAME uniform 404 as a random id-guess on every
 * owner-scoped endpoint for user B's download.
 */
describe('downloads: cross-user isolation (US2, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let aliceCookie: string;
  let bobDownloadId: string;
  const GUESS = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password');
    bob = await seedUser(t.services, 'bob', 'bob-password-9');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);
    const bobCookie = sessionCookieFor(t.app, t.services, bob.id);

    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie: bobCookie },
      payload: { url: 'http://93.184.216.34/ok' },
    });
    bobDownloadId = create.json().id;
    await pollUntilTerminal(t.app, bobCookie, bobDownloadId);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  async function asAlice(method: 'GET' | 'POST' | 'DELETE', url: string) {
    return t.app.inject({ method, url, headers: { cookie: aliceCookie } });
  }

  it('every owner-scoped endpoint returns a uniform 404 for a non-owned download', async () => {
    const cases: Array<{ name: string; url: string; method: 'GET' | 'POST' | 'DELETE' }> = [
      { name: 'get', method: 'GET', url: `/api/downloads/${bobDownloadId}` },
      { name: 'cancel', method: 'POST', url: `/api/downloads/${bobDownloadId}/cancel` },
      { name: 'retry', method: 'POST', url: `/api/downloads/${bobDownloadId}/retry` },
      { name: 'delete', method: 'DELETE', url: `/api/downloads/${bobDownloadId}` },
    ];

    for (const c of cases) {
      const real = await asAlice(c.method, c.url);
      const guess = await asAlice(c.method, c.url.replace(bobDownloadId, GUESS));
      expect(real.statusCode, `${c.name}: real id`).toBe(404);
      expect(guess.statusCode, `${c.name}: guessed id`).toBe(404);
      expect(real.json(), `${c.name}: identical body`).toEqual(guess.json());
    }
  });

  it("alice's history never includes bob's downloads", async () => {
    const list = await asAlice('GET', '/api/downloads');
    expect(list.json().items).toHaveLength(0);
  });

  it("bob's download is untouched after alice's probing", async () => {
    const bobCookie = sessionCookieFor(t.app, t.services, bob.id);
    const res = await t.app.inject({ method: 'GET', url: `/api/downloads/${bobDownloadId}`, headers: { cookie: bobCookie } });
    expect(res.json().status).toBe('completed');
  });
});
