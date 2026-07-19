import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, FakeBrowserProbe, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * FR-010 / Principle I (008, research R7): following embeds must never let the
 * server fetch an internal address. A discovered stream that resolves to a
 * private/loopback host is refused by the pipeline's SSRF re-guard before it is
 * ever handed to yt-dlp, so it never becomes a download target.
 */
describe('downloads: discovered internal stream is refused (SSRF)', () => {
  const PAGE = 'http://93.184.216.34/movie-page-no-video';
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    // The (faked) browser "discovers" a stream on a loopback address — the guard must drop it.
    t = await buildTestApp(
      {},
      {
        browserProbe: new FakeBrowserProbe([
          { streamUrl: 'http://127.0.0.1/internal.m3u8', headers: {}, sourceLabel: null },
        ]),
      },
    );
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('examine treats the internal stream as no video found', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/downloads/examine', headers: { cookie }, payload: { url: PAGE } });
    expect(res.json()).toEqual({ videoFound: false, directFile: false, candidates: [] });
  });

  it('a job over an internal-only page fails NO_VIDEO_FOUND and fetches nothing', async () => {
    const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('failed');
    expect(final.errorCode).toBe('NO_VIDEO_FOUND');
    expect(final.nodeId).toBeNull();
  });
});
