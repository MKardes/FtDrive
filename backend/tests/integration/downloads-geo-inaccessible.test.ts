import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * FR-008 / FR-009 (008, research R9): a region-locked source is reported as
 * inaccessible — a specific, non-silent reason — and is never bypassed. The
 * `/geo` fixture fails extraction with a geo-block message.
 */
describe('downloads: geo-blocked source reported, not silent (US1)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('examine surfaces a geo-block as inaccessible (422)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/geo' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('a geo-blocked download ends failed with a specific inaccessible reason', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/geo' },
    });
    expect(create.statusCode).toBe(201);
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);

    expect(final.status).toBe('failed');
    expect(final.errorCode).toBe('SOURCE_INACCESSIBLE');
    expect(final.errorCode).not.toBe('NO_VIDEO_FOUND');
    expect(final.errorMessage).toBeTruthy();
    expect(final.nodeId).toBeNull();
  });
});
