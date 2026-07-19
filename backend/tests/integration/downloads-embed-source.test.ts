import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, FakeBrowserProbe, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * US1 (008): a movie page with no static media but a player embedded from
 * another host is discovered via the headless fallback, and the resolved stream
 * downloads to a normal node (FR-001/FR-002/FR-005). A page whose embeds yield
 * nothing reports NO_VIDEO_FOUND and adds nothing.
 */
describe('downloads: embedded-player movie source (US1)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;

  beforeAll(async () => {
    // The movie page itself has no static video; the browser fallback resolves an
    // embedded stream (with the request context a protected fetch needs).
    t = await buildTestApp(
      {},
      {
        browserProbe: new FakeBrowserProbe([
          {
            streamUrl: 'http://93.184.216.34/embed-stream.m3u8',
            headers: { referer: 'http://player.example/embed', userAgent: 'FtDriveSniffer/1.0' },
            sourceLabel: 'player.example',
          },
        ]),
      },
    );
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('examine follows into the embed and reports a downloadable video', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/downloads/examine',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/movie-page-no-video' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.videoFound).toBe(true);
    expect(body.candidates.length).toBeGreaterThanOrEqual(1);
    // The examine wire shape stays exactly the three contract fields (api-delta.md).
    expect(Object.keys(body).sort()).toEqual(['candidates', 'directFile', 'videoFound']);
  });

  it('create downloads the embedded stream into Downloads as a playable node', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/downloads',
      headers: { cookie },
      payload: { url: 'http://93.184.216.34/movie-page-no-video' },
    });
    expect(create.statusCode).toBe(201);
    const final = await pollUntilTerminal(t.app, cookie, create.json().id);

    expect(final.status).toBe('completed');
    expect(final.nodeId).toBeTruthy();

    const content = await t.app.inject({
      method: 'GET',
      url: `/api/files/${final.nodeId}/content`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload.length).toBe(500_000); // the embed-stream fixture's payload
  });

  it('a page whose embeds yield no stream reports NO_VIDEO_FOUND', async () => {
    const noEmbed = await buildTestApp({}, { browserProbe: new FakeBrowserProbe([]) });
    try {
      const bob = await seedUser(noEmbed.services, 'bob', 'bob-password', 'owner');
      const bobCookie = sessionCookieFor(noEmbed.app, noEmbed.services, bob.id);

      const examine = await noEmbed.app.inject({
        method: 'POST',
        url: '/api/downloads/examine',
        headers: { cookie: bobCookie },
        payload: { url: 'http://93.184.216.34/movie-page-no-video' },
      });
      expect(examine.json()).toEqual({ videoFound: false, directFile: false, candidates: [] });
    } finally {
      await noEmbed.cleanup();
    }
  });
});
