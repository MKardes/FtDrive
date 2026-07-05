import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * US1 happy path (T020): examine reports the detected video, create enqueues
 * it, and polling reaches `completed` with a playable node in the caller's
 * drive (auto-created "Downloads" folder, FR-003).
 */
describe('downloads: examine + create happy path (US1)', () => {
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

  it('examine reports the detected video with title/duration/formats', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/ok' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.videoFound).toBe(true);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].title).toBe('Test Video');
    expect(body.candidates[0].durationSec).toBe(5);
    expect(body.candidates[0].formats.length).toBeGreaterThanOrEqual(2);
  });

  it('create enqueues the job and it completes with a playable node in Downloads', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/ok' },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.status).toBe('queued');
    expect(created.id).toBeTruthy();

    const final = await pollUntilTerminal(t.app, cookie, created.id);
    expect(final.status).toBe('completed');
    expect(final.nodeId).toBeTruthy();
    expect(final.title).toBe('Test Video');

    const listing = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    const downloadsFolder = listing.json().items.find((n: { name: string }) => n.name === 'Downloads');
    expect(downloadsFolder).toBeTruthy();

    const inFolder = await t.app.inject({
      method: 'GET',
      url: `/api/folders/${downloadsFolder.id}/children`,
      headers: { cookie },
    });
    const node = inFolder.json().items.find((n: { id: string }) => n.id === final.nodeId);
    expect(node).toBeTruthy();
    expect(node.type).toBe('file');

    const content = await t.app.inject({
      method: 'GET',
      url: `/api/files/${final.nodeId}/content`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload.length).toBeGreaterThan(0);
  });
});
