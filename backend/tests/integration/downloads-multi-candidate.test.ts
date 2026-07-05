import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/** Examining a multi-video page returns every candidate with its formats (US3, T050). */
describe('downloads: multi-candidate examine (US3)', () => {
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

  it('returns every detected candidate with title/duration/formats', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/multi' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.videoFound).toBe(true);
    expect(body.candidates).toHaveLength(2);

    expect(body.candidates[0]).toMatchObject({ title: 'First video', durationSec: 10 });
    expect(body.candidates[1]).toMatchObject({ title: 'Second video', durationSec: 20 });
    for (const candidate of body.candidates) {
      expect(candidate.formats.length).toBeGreaterThanOrEqual(2);
      for (const format of candidate.formats) {
        expect(format).toHaveProperty('formatId');
        expect(format).toHaveProperty('quality');
        expect(format).toHaveProperty('ext');
        expect(format).toHaveProperty('estimatedBytes');
      }
    }
  });
});
