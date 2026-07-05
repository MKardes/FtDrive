import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Over-size, over-time, and over-quota downloads are refused (409) or stopped
 * (failed, retryable), leaving no partial file (FR-014/FR-020, T038, gating).
 */
describe('downloads: size ceiling (US2, gating)', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp({ downloadMaxBytes: 20 * 1024 * 1024 * 1024 });
    const alice = await seedUser(t.services, 'alice', 'alice-password');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('refuses a download whose declared size exceeds the ceiling (409), inserting no row', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/huge' },
    });
    expect(res.statusCode).toBe(409);

    const list = await t.app.inject({ method: 'GET', url: '/api/downloads', headers: { cookie } });
    expect(list.json().items).toHaveLength(0);
  });
});

describe('downloads: wall-clock cap (US2, gating)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp({ downloadMaxDurationMs: 120 });
    alice = await seedUser(t.services, 'alice', 'alice-password');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('stops a download that runs past the wall-clock cap, failing it retryably with no node', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/slow' },
    });
    const id = create.json().id;

    const final = await pollUntilTerminal(t.app, cookie, id);
    expect(final.status).toBe('failed');
    expect(final.errorCode).toBe('TIME_LIMIT');
    expect(final.nodeId).toBeNull();

    const listing = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${t.services.nodes.ensureRootNode(alice.id).id}/children`,
      headers: { cookie },
    });
    const rootItems = listing.json().items as Array<{ id: string; type: string }>;
    for (const folder of rootItems.filter((n) => n.type === 'folder')) {
      const inside = await t.app.inject({ method: 'GET', url: `/api/folders/${folder.id}/children`, headers: { cookie } });
      expect(inside.json().items).toHaveLength(0);
    }
  });
});

describe('downloads: per-user storage quota (US2, gating)', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp({ userStorageQuotaBytes: 10 });
    const alice = await seedUser(t.services, 'alice', 'alice-password');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('refuses a download that would exceed the remaining quota (409)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/ok' },
    });
    expect(res.statusCode).toBe(409);
  });
});
