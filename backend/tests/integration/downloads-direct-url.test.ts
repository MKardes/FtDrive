import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** Direct-file URL skips the review step and still completes (FR-004, T021). */
describe('downloads: direct-file URL shortcut (US1)', () => {
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

  it('creates and completes without the caller ever calling /examine', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/direct.mp4' },
    });
    expect(create.statusCode).toBe(201);

    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('completed');
    expect(final.nodeId).toBeTruthy();
  });
});
