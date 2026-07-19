import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, FakeBrowserProbe, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * US3 (008, FR-007): a resolved movie source exposing several qualities lists
 * them; an explicit pick is honored, and omitting a choice downloads the best.
 * The `/embed-quality` fixture is one candidate with size-coded renditions
 * (q-480p = 150 000 bytes, q-1080p = 250 000) so the chosen quality is provable.
 */
describe('downloads: quality choice on an embedded movie source (US3)', () => {
  const PAGE = 'http://93.184.216.34/movie-page-no-video';
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    t = await buildTestApp(
      {},
      {
        browserProbe: new FakeBrowserProbe([
          { streamUrl: 'http://93.184.216.34/embed-quality.m3u8', headers: { referer: 'http://player.example/e' }, sourceLabel: null },
        ]),
      },
    );
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('examine lists the available qualities', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/downloads/examine', headers: { cookie }, payload: { url: PAGE } });
    const body = res.json();
    expect(body.videoFound).toBe(true);
    const formats = body.candidates[0].formats.map((f: { formatId: string }) => f.formatId);
    expect(formats).toEqual(expect.arrayContaining(['q-480p', 'q-1080p']));
  });

  it('downloads the explicitly chosen quality', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: PAGE, formatId: 'q-480p' },
    });
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('completed');
    const content = await t.app.inject({ method: 'GET', url: `/api/files/${final.nodeId}/content`, headers: { cookie } });
    expect(content.rawPayload.length).toBe(150_000);
  });

  it('defaults to the highest quality when none is chosen', async () => {
    const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);
    expect(final.status).toBe('completed');
    const content = await t.app.inject({ method: 'GET', url: `/api/files/${final.nodeId}/content`, headers: { cookie } });
    expect(content.rawPayload.length).toBe(250_000);
  });
});
