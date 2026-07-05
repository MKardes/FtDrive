import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * SSRF guard rejects loopback/private/self URLs at both examine and create,
 * with no job ever created (FR-013, T037, gating).
 */
describe('downloads: SSRF guard (US2, gating)', () => {
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

  const disallowed = [
    'http://127.0.0.1/admin',
    'http://10.0.0.5/internal',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/router',
    'ftp://93.184.216.34/video.mp4',
  ];

  it.each(disallowed)('examine rejects %s with 400 and creates nothing', async (url) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url },
    });
    expect(res.statusCode).toBe(400);
  });

  it.each(disallowed)('create rejects %s with 400 and inserts no row', async (url) => {
    const res = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url } });
    expect(res.statusCode).toBe(400);
  });

  it('no download rows exist after every rejected attempt', async () => {
    const list = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie } });
    expect(list.json().items).toHaveLength(0);
  });
});
