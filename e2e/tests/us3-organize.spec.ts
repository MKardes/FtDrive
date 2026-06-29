import { expect, test } from '@playwright/test';
import { uiLogin, SAMPLE_JPEG } from './helpers';

/**
 * US3 — organize + trash recovery (T068). Create a folder, rename a file, delete
 * a non-empty folder (with a confirmation dialog), then restore it from Trash.
 * Runs on desktop + 360px via the project matrix.
 */
test.describe('US3 — organize, delete with confirm, restore', () => {
  test('create a folder, rename a file, trash a non-empty folder, then restore', async ({ page }) => {
    await uiLogin(page);
    const suffix = Date.now();
    const folderName = `Album_${suffix}`;
    const fileName = `pic-${suffix}.jpg`;
    const renamed = `renamed-${suffix}.jpg`;

    // Create a folder.
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill(folderName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTitle(folderName)).toBeVisible();

    // Upload a file, then rename it.
    await page.getByLabel('Choose files to upload').setInputFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.locator('.file-grid').getByTitle(fileName)).toBeVisible();

    const fileCard = page.locator('.file-card-wrapper', { hasText: fileName });
    await fileCard.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel('New name').fill(renamed);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTitle(renamed)).toBeVisible();

    // Put a file inside the folder so deletion is a non-empty subtree.
    await page.getByTitle(folderName).click();
    await page.getByLabel('Choose files to upload').setInputFiles({
      name: `inside-${suffix}.jpg`,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.locator('.file-grid').getByTitle(`inside-${suffix}.jpg`)).toBeVisible();

    // Back to root and delete the non-empty folder — confirmation required.
    await page.getByRole('link', { name: 'Files', exact: true }).click();
    const folderCard = page.locator('.file-card-wrapper', { hasText: folderName });
    await folderCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/moved to Trash/i)).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.getByTitle(folderName)).toHaveCount(0);

    // Restore it from Trash; it returns to the listing.
    await page.getByRole('link', { name: 'Trash' }).click();
    const trashRow = page.locator('.list-row', { hasText: folderName });
    await expect(trashRow).toBeVisible();
    await trashRow.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('.list-row', { hasText: folderName })).toHaveCount(0);

    await page.getByRole('link', { name: 'Files', exact: true }).click();
    await expect(page.getByTitle(folderName)).toBeVisible();
  });
});
