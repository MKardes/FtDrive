import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** A page with no video is reported cleanly and adds nothing to the drive (FR-002, T022). */
describe('downloads: no video found (US1)', () => {
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

  it('examine reports videoFound=false and creates nothing', async () => {
    const before = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${rootId(t.services, alice.id)}/children`,
      headers: { cookie },
    });
    const countBefore = before.json().items.length;

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/no-video' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ videoFound: false, directFile: false, candidates: [] });

    const after = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${rootId(t.services, alice.id)}/children`,
      headers: { cookie },
    });
    expect(after.json().items.length).toBe(countBefore);
  });
});
