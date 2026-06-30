import { expect, test } from '@playwright/test';
import { apiLogin, uiLogin, SAMPLE_JPEG } from './helpers';

/**
 * US2 — upload + download (T048). Uploads through the real UI (including a
 * mobile viewport via the project matrix), verifies the file lands in the grid,
 * downloads it byte-for-byte through the content endpoint, and confirms a
 * name collision keeps both copies (FR-013).
 */
test.describe('US2 — upload, download, keep-both', () => {
  test('uploads a file that appears in the grid', async ({ page }) => {
    await uiLogin(page);
    const name = `upload-${Date.now()}.jpg`;

    await page.getByLabel('Choose files to upload').setInputFiles({
      name,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });

    // Per-file progress row, then the grid refreshes to show the new file.
    await expect(page.getByText('Done')).toBeVisible();
    await expect(page.locator('.file-grid').getByTitle(name)).toBeVisible();
  });

  test('downloads an uploaded file byte-for-byte', async ({ page, request }) => {
    await uiLogin(page);
    await apiLogin(request);
    const name = `download-${Date.now()}.jpg`;

    await page.getByLabel('Choose files to upload').setInputFiles({
      name,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.locator('.file-grid').getByTitle(name)).toBeVisible();

    // Find the node id from the listing, then fetch its content and compare.
    const listing = await request.get('/api/folders/root/children?limit=200');
    const node = (await listing.json()).items.find((n: { name: string }) => n.name === name);
    expect(node).toBeTruthy();

    const content = await request.get(`/api/files/${node.id}/content`);
    expect(content.ok()).toBe(true);
    const body = await content.body();
    expect(Buffer.compare(body, SAMPLE_JPEG)).toBe(0);
  });

  test('keeps both when the same name is uploaded twice', async ({ page }) => {
    await uiLogin(page);
    const name = `dup-${Date.now()}.jpg`;
    const file = { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG };

    await page.getByLabel('Choose files to upload').setInputFiles(file);
    await expect(page.locator('.file-grid').getByTitle(name)).toBeVisible();

    await page.getByLabel('Choose files to upload').setInputFiles(file);
    // The second upload is renamed; both originals + the suffixed copy exist.
    await expect(page.getByText(/was kept as/)).toBeVisible();
    await expect(
      page.locator('.file-grid').getByTitle(new RegExp(`${name.replace('.jpg', '')} \\(2\\)\\.jpg`)),
    ).toBeVisible();
  });
});
