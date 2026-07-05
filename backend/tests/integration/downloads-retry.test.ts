import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** A failed download shows a human-readable reason; retry re-queues it (FR-009, T035). */
describe('downloads: failure reason + retry (US2)', () => {
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

  it('fails with a readable reason and retry re-queues (attempt increments)', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/fail-download' },
    });
    const id = create.json().id;

    const failed = await pollUntilTerminal(t.app, cookie, id);
    expect(failed.status).toBe('failed');
    expect(typeof failed.errorMessage).toBe('string');
    expect((failed.errorMessage as string).length).toBeGreaterThan(0);
    expect(failed.attempt).toBe(0);

    const retry = await t.app.inject({ method: 'POST', url: `/api/downloads/${id}/retry`, headers: { cookie } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().status).toBe('queued');
    expect(retry.json().attempt).toBe(1);

    const failedAgain = await pollUntilTerminal(t.app, cookie, id);
    expect(failedAgain.status).toBe('failed');
    expect(failedAgain.attempt).toBe(1);
  });

  it('retrying a non-terminal (active) download returns 409', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/slow' },
    });
    const id = create.json().id;
    const res = await t.app.inject({ method: 'POST', url: `/api/downloads/${id}/retry`, headers: { cookie } });
    expect(res.statusCode).toBe(409);
    await pollUntilTerminal(t.app, cookie, id); // drain before the suite tears down
  });
});
