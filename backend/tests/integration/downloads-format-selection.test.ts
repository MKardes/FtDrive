import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Creating with an explicit `formatId` downloads only that candidate/format;
 * omitting it downloads the primary candidate's highest-quality format (US3,
 * T051). The fixture's `/multi` formats are byte-size-coded so the resulting
 * node's size proves exactly which one was fetched.
 */
describe('downloads: format/candidate selection (US3)', () => {
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

  it('an explicit formatId downloads exactly that candidate/format', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/multi', formatId: 'c2-480p' },
    });
    expect(create.statusCode).toBe(201);
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('completed');

    const node = t.services.nodes.getOwnedNode(alice.id, final.nodeId as string);
    expect(node?.size).toBe(300_000); // c2-480p
  });

  it('omitting formatId downloads the primary candidate\'s highest-quality format', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/multi' },
    });
    expect(create.statusCode).toBe(201);
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('completed');

    const node = t.services.nodes.getOwnedNode(alice.id, final.nodeId as string);
    expect(node?.size).toBe(200_000); // c1-1080p: primary candidate, highest quality
  });
});
