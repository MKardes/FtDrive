import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { apiLogin, newMenuAction, uiLogin } from './helpers';

/**
 * Download-from-web E2E journey (002-url-video-download, T057): paste → review
 * → download → play, run against both the desktop and 360px mobile projects
 * (playwright.config.ts). Uses a LOCAL fixture HTTP server for the video — no
 * live third-party site in CI (research.md §11).
 *
 * Requires the server under test to have a working `yt-dlp` on `YT_DLP_PATH`
 * and `DOWNLOAD_ALLOW_PRIVATE_ADDRESSES=true` (the fixture server binds to
 * loopback, which the SSRF guard otherwise refuses by design — see the
 * deployment guide). Skips itself if the feature reports unavailable so the
 * rest of the E2E suite isn't blocked by an unrelated host prerequisite.
 */

const FIXTURE_BYTES = Buffer.alloc(300_000, 0x61); // arbitrary bytes; yt-dlp's generic extractor just fetches them

function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolvePromise) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(FIXTURE_BYTES.length) });
      res.end(FIXTURE_BYTES);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolvePromise({
        url: `http://127.0.0.1:${port}/e2e-clip.mp4`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test.describe('Download from web (US1/US2 E2E)', () => {
  test('paste a direct video URL, review, download, and play it', async ({ page, request }) => {
    const availability = await request.post('/api/downloads/examine', { data: { url: 'not a url' } });
    if (availability.status() === 503) {
      test.skip(true, 'Downloads are disabled or yt-dlp is unavailable on this host');
    }

    const fixture = await startFixtureServer();
    try {
      await apiLogin(request);
      await uiLogin(page);

      await newMenuAction(page, 'Download from web');
      await page.getByLabel(/page or video url/i).fill(fixture.url);
      await page.getByRole('button', { name: 'Examine' }).click();

      // A direct video file skips candidate review (FR-004).
      await expect(page.getByText(/ready to download/i)).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      await expect(page.locator('.modal-backdrop')).toHaveCount(0);

      // Track it to completion on the Downloads (job history) page.
      await page.goto('/downloads');
      await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 30_000 });

      // Find the resulting file anywhere in the drive and confirm it plays.
      await page.goto('/');
      await page.getByLabel('Search files').fill('e2e-clip');
      const card = page.locator('.file-card', { hasText: 'e2e-clip' }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.click();

      const video = page.locator('video');
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('src', /\/api\/files\/.+\/content$/);
    } finally {
      await fixture.close();
    }
  });
});
