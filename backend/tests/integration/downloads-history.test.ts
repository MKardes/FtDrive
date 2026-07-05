import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** `GET /downloads` lists only the caller's history; `DELETE /downloads` clears it without deleting files (FR-017, T040). */
describe('downloads: per-user history + clear (US2)', () => {
  let t: TestApp;
  let alice: UserRow;
  let bob: UserRow;
  let aliceCookie: string;
  let bobCookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password');
    bob = await seedUser(t.services, 'bob', 'bob-password-9');
    aliceCookie = sessionCookieFor(t.app, t.services, alice.id);
    bobCookie = sessionCookieFor(t.app, t.services, bob.id);

    for (const cookie of [aliceCookie, bobCookie]) {
      const create = await t.app.inject({
        method: 'POST',
        url: '/api/downloads',
        headers: { cookie },
        payload: { url: 'http://93.184.216.34/ok' },
      });
      await pollUntilTerminal(t.app, cookie, create.json().id);
    }
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("lists only the caller's downloads", async () => {
    const list = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie: aliceCookie } });
    expect(list.json().items).toHaveLength(1);
  });

  it('clearing history removes the record but not the resulting file', async () => {
    const before = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie: aliceCookie } });
    const nodeId = before.json().items[0].nodeId as string;

    const clear = await t.app.inject({ method: 'DELETE', url: '/api/downloads', headers: { cookie: aliceCookie } });
    expect(clear.statusCode).toBe(204);

    const after = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie: aliceCookie } });
    expect(after.json().items).toHaveLength(0);

    // The file itself is untouched.
    const content = await t.app.inject({
      method: 'GET',
      url: `/api/files/${nodeId}/content`,
      headers: { cookie: aliceCookie },
    });
    expect(content.statusCode).toBe(200);

    // Bob's history is unaffected by alice clearing hers.
    const bobList = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie: bobCookie } });
    expect(bobList.json().items).toHaveLength(1);
  });
});
