import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, FakeBrowserProbe, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * US1 / FR-004 (008): protected movie streams 403 a context-less request. The
 * `/embed-stream` fixture succeeds ONLY when a `--referer` flag reaches yt-dlp,
 * so these two tests prove the captured request context is threaded through the
 * download (with context → completes; without → fails, not a silent partial).
 */
describe('downloads: protected stream needs captured request context (US1)', () => {
  const PAGE = 'http://93.184.216.34/movie-page-no-video';

  async function appWithSource(headers: Record<string, string>) {
    return buildTestApp(
      {},
      {
        browserProbe: new FakeBrowserProbe([
          { streamUrl: 'http://93.184.216.34/embed-stream.m3u8', headers, sourceLabel: 'player.example' },
        ]),
      },
    );
  }

  describe('with the captured Referer', () => {
    let t: TestApp;
    let alice: UserRow;
    let cookie: string;
    beforeAll(async () => {
      t = await appWithSource({ referer: 'http://player.example/embed' });
      alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
      cookie = sessionCookieFor(t.app, t.services, alice.id);
    });
    afterAll(async () => {
      await t.cleanup();
    });

    it('the protected stream downloads to completion', async () => {
      const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
      const final = await pollUntilTerminal(t.app, cookie, create.json().id);
      expect(final.status).toBe('completed');
      expect(final.nodeId).toBeTruthy();
    });
  });

  describe('without any request context', () => {
    let t: TestApp;
    let bob: UserRow;
    let cookie: string;
    beforeAll(async () => {
      t = await appWithSource({}); // no referer captured
      bob = await seedUser(t.services, 'bob', 'bob-password', 'owner');
      cookie = sessionCookieFor(t.app, t.services, bob.id);
    });
    afterAll(async () => {
      await t.cleanup();
    });

    it('the context-less fetch fails, leaving no node and no partial file', async () => {
      const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
      const final = await pollUntilTerminal(t.app, cookie, create.json().id);
      expect(final.status).toBe('failed');
      expect(final.nodeId).toBeNull();
      expect(final.errorMessage).toBeTruthy();
    });
  });
});
