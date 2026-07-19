import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, pollUntilTerminal, FakeBrowserProbe, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * US2 (008, FR-003): a movie page lists several source mirrors. `run()` tries
 * them in order until one downloads — with zero extra user action — and reports
 * ALL_SOURCES_FAILED (never a silent partial) only when every source fails.
 * The `fail-download` fixture path exits non-zero mid-download; `-ok` succeeds.
 */
describe('downloads: automatic multi-source fallback (US2)', () => {
  const PAGE = 'http://93.184.216.34/movie-page-no-video';

  describe('first source fails, a later source succeeds', () => {
    let t: TestApp;
    let alice: UserRow;
    let cookie: string;
    beforeAll(async () => {
      t = await buildTestApp(
        {},
        {
          browserProbe: new FakeBrowserProbe([
            'http://93.184.216.34/src-a-fail-download.m3u8',
            'http://93.184.216.34/src-b-ok.m3u8',
            'http://93.184.216.34/src-c.m3u8',
          ]),
        },
      );
      alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
      cookie = sessionCookieFor(t.app, t.services, alice.id);
    });
    afterAll(async () => {
      await t.cleanup();
    });

    it('completes from the working mirror with no extra user action', async () => {
      const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
      const final = await pollUntilTerminal(t.app, cookie, create.json().id);

      expect(final.status).toBe('completed');
      expect(final.nodeId).toBeTruthy();
      const content = await t.app.inject({
        method: 'GET',
        url: `/api/files/${final.nodeId}/content`,
        headers: { cookie },
      });
      expect(content.rawPayload.length).toBe(500_000); // the working (-ok) source's payload
    });
  });

  describe('every source fails', () => {
    let t: TestApp;
    let bob: UserRow;
    let cookie: string;
    beforeAll(async () => {
      t = await buildTestApp(
        {},
        {
          browserProbe: new FakeBrowserProbe([
            'http://93.184.216.34/src1-fail-download.m3u8',
            'http://93.184.216.34/src2-fail-download.m3u8',
            'http://93.184.216.34/src3-fail-download.m3u8',
          ]),
        },
      );
      bob = await seedUser(t.services, 'bob', 'bob-password', 'owner');
      cookie = sessionCookieFor(t.app, t.services, bob.id);
    });
    afterAll(async () => {
      await t.cleanup();
    });

    it('ends failed with ALL_SOURCES_FAILED and no partial file', async () => {
      const create = await t.app.inject({ method: 'POST', url: '/api/downloads', headers: { cookie }, payload: { url: PAGE } });
      const final = await pollUntilTerminal(t.app, cookie, create.json().id);

      expect(final.status).toBe('failed');
      expect(final.errorCode).toBe('ALL_SOURCES_FAILED');
      expect(final.nodeId).toBeNull();

      // No file was left behind anywhere in the user's drive.
      const rootListing = await t.app.inject({ method: 'GET', url: '/api/folders/root/children', headers: { cookie } });
      const downloads = rootListing.json().items.find((n: { name: string }) => n.name === 'Downloads');
      if (downloads) {
        const inFolder = await t.app.inject({ method: 'GET', url: `/api/folders/${downloads.id}/children`, headers: { cookie } });
        expect(inFolder.json().items).toHaveLength(0);
      }
    });
  });
});
