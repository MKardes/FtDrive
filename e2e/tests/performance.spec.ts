import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiLogin, uiLogin, SAMPLE_JPEG } from './helpers';

/**
 * Performance validation (T073). Exercises the headline success criteria:
 *  - SC-006: a folder with 1,000+ items shows first content in < 2 s (keyset
 *    pagination + lazy thumbnails — we never fetch the whole folder).
 *  - SC-004: a freshly uploaded phone photo gets a thumbnail in < 10 s.
 *  - SC-003: on a 360px viewport, locate an item by name search and open it
 *    (photo) in < 30 s.
 *
 * These are wall-clock budgets against the production single deployable; they
 * are generous enough to be stable in CI while still catching regressions.
 */

const BIG_FOLDER = 'perf-1000';

/** Seed a folder with `count` items once (idempotent across project re-runs). */
async function seedLargeFolder(request: APIRequestContext, count: number): Promise<string> {
  await apiLogin(request);

  const existing = await (await request.get('/api/folders/root/children?limit=200')).json();
  let folder = existing.items.find((n: { name: string }) => n.name === BIG_FOLDER);
  if (!folder) {
    const res = await request.post('/api/folders', { data: { parentId: null, name: BIG_FOLDER } });
    folder = await res.json();
  }

  const page = await (await request.get(`/api/folders/${folder.id}/children?limit=1`)).json();
  if (page.items.length > 0) return folder.id; // already seeded

  // Create items with bounded concurrency so seeding stays quick but gentle.
  const ids = Array.from({ length: count }, (_, i) => i);
  const BATCH = 25;
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(
      ids.slice(i, i + BATCH).map((n) =>
        request.post('/api/folders', {
          data: { parentId: folder.id, name: `item-${String(n).padStart(4, '0')}` },
        }),
      ),
    );
  }
  return folder.id;
}

test.describe('Performance & responsiveness', () => {
  test('SC-006: a 1,000-item folder renders first content in < 2 s', async ({ page, request }) => {
    test.slow(); // seeding 1,000 items takes a moment
    const folderId = await seedLargeFolder(request, 1000);

    await uiLogin(page);
    const start = Date.now();
    await page.goto(`/folder/${folderId}`);
    await expect(page.locator('.file-card').first()).toBeVisible();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('SC-004: an uploaded photo gets a thumbnail in < 10 s', async ({ page }) => {
    await uiLogin(page);
    // Upload into a fresh, empty folder so the new card is the only item (above
    // the fold, so its lazy thumbnail loads immediately and deterministically).
    const folder = await (
      await page.request.post('/api/folders', {
        data: { parentId: null, name: `perf-thumb-folder-${Date.now()}` },
      })
    ).json();
    await page.goto(`/folder/${folder.id}`);

    const name = `perf-thumb-${Date.now()}.jpg`;
    const start = Date.now();
    await page.getByLabel('Choose files to upload').setInputFiles({
      name,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    const card = page.locator('.file-card-wrapper', { hasText: name });
    await expect(card.locator('img')).toHaveAttribute('src', /\/thumbnail$/, { timeout: 10_000 });
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  test('SC-003: locate by search and open a photo on a 360px viewport in < 30 s', async ({ page }) => {
    await uiLogin(page);
    const name = `perf-find-${Date.now()}.jpg`;
    await page.getByLabel('Choose files to upload').setInputFiles({
      name,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.getByText('Done')).toBeVisible(); // upload committed

    // The whole point of SC-003: find it by name (independent of where it sits in
    // a large, paginated folder) and open it. Searching unmounts the uploader, so
    // the only match is the search-result card.
    const start = Date.now();
    await page.getByLabel(/search files/i).fill(name);
    await page.getByTitle(name).click();
    await expect(page.getByRole('img', { name: new RegExp(name) })).toBeVisible();
    expect(Date.now() - start).toBeLessThan(30_000);
  });
});
