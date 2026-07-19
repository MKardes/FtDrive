import { expect, test, type Page } from '@playwright/test';
import { apiLogin, gotoSection, newMenuAction, uiLogin, SAMPLE_JPEG } from './helpers';

/** True only if the two rectangles actually intersect (not just touch at an edge). */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (!a || !b) return false;
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0.5 && oy > 0.5;
}

async function createFolderAndSeedFiles(
  page: Page,
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  folderName: string,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
): Promise<Array<{ id: string; name: string }>> {
  await newMenuAction(page, 'New folder');
  await page.getByLabel('Folder name').fill(folderName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTitle(folderName)).toBeVisible();

  await apiLogin(request);
  const rootListing = await request.get('/api/folders/root/children?limit=200');
  const folder = (await rootListing.json()).items.find((n: { name: string }) => n.name === folderName);
  if (!folder) throw new Error(`Seeded folder "${folderName}" not found via API`);

  for (const file of files) {
    await request.post('/api/files', {
      multipart: { parentId: folder.id, file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer } },
    });
  }
  const listing = await request.get(`/api/folders/${folder.id}/children?limit=200`);
  return (await listing.json()).items;
}

/** US1 — details menu replaces always-visible buttons (005-actions-menu-bulk-select). */
test.describe('US1 — details menu', () => {
  test('open/close via outside click and Escape; switching cards closes the previous menu', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `Menu_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'menu-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'menu-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('menu-a.jpg')).toBeVisible();

    const cardA = page.locator('.file-card-wrapper', { hasText: 'menu-a.jpg' });
    const cardB = page.locator('.file-card-wrapper', { hasText: 'menu-b.jpg' });

    // Open, then outside click closes with no action taken.
    await cardA.getByRole('button', { name: 'Details for menu-a.jpg' }).click();
    await expect(cardA.getByRole('button', { name: 'Rename' })).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(cardA.getByRole('button', { name: 'Rename' })).toHaveCount(0);

    // Open, then Escape closes it.
    await cardA.getByRole('button', { name: 'Details for menu-a.jpg' }).click();
    await expect(cardA.getByRole('button', { name: 'Rename' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cardA.getByRole('button', { name: 'Rename' })).toHaveCount(0);

    // Opening B's menu while A's is open closes A's.
    await cardA.getByRole('button', { name: 'Details for menu-a.jpg' }).click();
    await expect(cardA.getByRole('button', { name: 'Rename' })).toBeVisible();
    await cardB.getByRole('button', { name: 'Details for menu-b.jpg' }).click();
    await expect(cardA.getByRole('button', { name: 'Rename' })).toHaveCount(0);
    await expect(cardB.getByRole('button', { name: 'Rename' })).toBeVisible();
  });

  test('the details menu and quick action are available on search results too (FR-012)', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    await apiLogin(request);
    const name = `searchable-${Date.now()}.jpg`;
    await request.post('/api/files', {
      multipart: {
        parentId: 'root',
        file: { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      },
    });
    await page.getByLabel('Search files').fill(name.slice(0, 10));
    const card = page.locator('.file-card-wrapper', { hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: `Details for ${name}` })).toBeVisible();
    await expect(card.getByTitle('Download')).toBeVisible();
    await card.getByRole('button', { name: `Details for ${name}` }).click();
    await expect(card.getByRole('button', { name: 'Rename' })).toBeVisible();
  });

  test('at 360px, the quick action and details trigger never overlap any card element', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await uiLogin(page);
    const folderName = `MenuOverlap_${Date.now()}`;
    const longName = 'AVeryLongUnbrokenFileNameForOverlapStressTesting.jpg';
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: longName, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'overlap-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle(longName)).toBeVisible();

    const wrappers = page.locator('.file-card-wrapper');
    const count = await wrappers.count();
    for (let i = 0; i < count; i += 1) {
      const wrapper = wrappers.nth(i);
      const triggerBox = await wrapper.getByRole('button', { name: /^Details for/ }).boundingBox();
      const quickActionBox = await wrapper.getByTitle('Download').boundingBox().catch(() => null);
      expect(rectsOverlap(triggerBox, quickActionBox)).toBe(false);
    }
  });
});

/** US2 — bulk selection (005-actions-menu-bulk-select). */
test.describe('US2 — bulk selection', () => {
  test('Select toggle is unavailable while a dialog is open', async ({ page }) => {
    await uiLogin(page);
    await newMenuAction(page, 'New folder');
    await expect(page.getByLabel('Folder name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Select' })).toBeEnabled();
  });

  test('select, bulk delete, and bulk move apply to every selected item', async ({ page, request }) => {
    await uiLogin(page);
    const folderName = `Bulk_${Date.now()}`;
    const destName = `BulkDest_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'bulk-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'bulk-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'bulk-c.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'bulk-d.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'bulk-e.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    // A destination folder for the bulk-move half of this test.
    await newMenuAction(page, 'New folder');
    await page.getByLabel('Folder name').fill(destName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTitle(destName)).toBeVisible();

    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('bulk-a.jpg')).toBeVisible();

    // No checkboxes/bulk bar before Select mode is on.
    await expect(page.locator('.file-card__checkbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Select' }).click();
    await expect(page.locator('.file-card__checkbox').first()).toBeVisible();

    // Select 3 of the 5 items — bulk bar shows the count.
    for (const name of ['bulk-a.jpg', 'bulk-b.jpg', 'bulk-c.jpg']) {
      await page.locator('.file-card-wrapper', { hasText: name }).click();
    }
    await expect(page.getByText('3 selected')).toBeVisible();

    // Bulk delete 2 of the 3 (bulk-a, bulk-b) first.
    await page.locator('.file-card-wrapper', { hasText: 'bulk-c.jpg' }).click(); // deselect c
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Delete 2 items?')).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.locator('.file-grid').getByTitle('bulk-a.jpg')).toHaveCount(0);
    await expect(page.locator('.file-grid').getByTitle('bulk-b.jpg')).toHaveCount(0);
    // Selection cleared after the bulk action; Select mode itself stays on.
    await expect(page.getByText(/selected/)).toHaveCount(0);

    // Bulk-move the remaining two (bulk-c, bulk-d) into the destination folder.
    await page.locator('.file-card-wrapper', { hasText: 'bulk-c.jpg' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'bulk-d.jpg' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText('Move 2 items')).toBeVisible();
    await page.locator('.list-row', { hasText: destName }).getByRole('button', { name: 'Open' }).click();
    await page.getByRole('button', { name: 'Move here' }).click();
    await expect(page.locator('.file-grid').getByTitle('bulk-c.jpg')).toHaveCount(0);
    await expect(page.locator('.file-grid').getByTitle('bulk-d.jpg')).toHaveCount(0);

    // Turning Select mode off clears checkboxes/bulk bar.
    await page.getByRole('button', { name: 'Done selecting' }).click();
    await expect(page.locator('.file-card__checkbox')).toHaveCount(0);

    // Verify the moved files actually landed in the destination.
    await gotoSection(page, 'My Drive');
    await page.getByTitle(destName).click();
    await expect(page.locator('.file-grid').getByTitle('bulk-c.jpg')).toBeVisible();
    await expect(page.locator('.file-grid').getByTitle('bulk-d.jpg')).toBeVisible();
  });

  test('a partial failure reports the specific failed item while the rest succeed (FR-008)', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `BulkPartial_${Date.now()}`;
    const seeded = await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'partial-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'partial-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    const toRemove = seeded.find((n) => n.name === 'partial-a.jpg');
    if (!toRemove) throw new Error('seed file not found');

    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('partial-a.jpg')).toBeVisible();

    await page.getByRole('button', { name: 'Select' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'partial-a.jpg' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'partial-b.jpg' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();

    // Simulate another session deleting partial-a.jpg before the bulk action runs.
    const del = await request.delete(`/api/nodes/${toRemove.id}`);
    expect(del.ok()).toBe(true);

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Delete 2 items?')).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash' }).click();

    // The still-valid item succeeds; the missing one is reported by name.
    await expect(page.locator('.file-grid').getByTitle('partial-b.jpg')).toHaveCount(0);
    await expect(page.getByText('partial-a.jpg')).toBeVisible();
    await expect(page.getByText(/no longer available/i)).toBeVisible();
  });

  test('selection clears on folder navigation and on starting a search', async ({ page, request }) => {
    await uiLogin(page);
    const folderName = `BulkClear_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'clear-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'clear-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('clear-a.jpg')).toBeVisible();

    await page.getByRole('button', { name: 'Select' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'clear-a.jpg' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();

    await gotoSection(page, 'My Drive');
    await expect(page.getByText(/selected/)).toHaveCount(0);

    // Select mode itself stays on across navigation (only the selection clears,
    // per FR-009/data-model.md) — while on, clicking a card toggles selection
    // instead of opening it, even for folders, so turn it off before navigating
    // back in.
    await page.getByRole('button', { name: 'Done selecting' }).click();
    await page.getByTitle(folderName).click();
    await page.getByRole('button', { name: 'Select' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'clear-a.jpg' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();
    await page.getByLabel('Search files').fill('clear-a');
    await expect(page.getByText(/selected/)).toHaveCount(0);
  });

  test('at 360px, the Select toggle, checkboxes, and bulk bar never overlap', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await uiLogin(page);
    const folderName = `BulkOverlap_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'ov-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'ov-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('ov-a.jpg')).toBeVisible();

    await page.getByRole('button', { name: 'Select' }).click();
    await page.locator('.file-card-wrapper', { hasText: 'ov-a.jpg' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();

    const toggleBox = await page.getByRole('button', { name: 'Done selecting' }).boundingBox();
    const bulkBarBox = await page.locator('.bulk-bar').boundingBox();
    const checkboxBoxA = await page
      .locator('.file-card-wrapper', { hasText: 'ov-a.jpg' })
      .locator('.file-card__checkbox')
      .boundingBox();
    const checkboxBoxB = await page
      .locator('.file-card-wrapper', { hasText: 'ov-b.jpg' })
      .locator('.file-card__checkbox')
      .boundingBox();

    expect(rectsOverlap(toggleBox, bulkBarBox)).toBe(false);
    expect(rectsOverlap(checkboxBoxA, checkboxBoxB)).toBe(false);
  });

  test('Select all selects every loaded item and toggles to Deselect all', async ({ page, request }) => {
    await uiLogin(page);
    // Deliberately avoids any "Select"-prefixed name: the accumulated root listing
    // in this shared e2e database is never reset between tests, and a folder name
    // containing "Select" would substring-match the "Select"/"Select all" button
    // lookups below (this bit a first draft of this test).
    const folderName = `PickAll_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'sa-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'sa-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'sa-c.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('sa-a.jpg')).toBeVisible();

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.getByText('3 selected')).toBeVisible();
    await expect(page.locator('.file-card__checkbox:checked')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
    await expect(page.getByText(/selected/)).toHaveCount(0);
    await expect(page.locator('.file-card__checkbox:checked')).toHaveCount(0);

    // Deselecting one item after Select all flips the label back to "Select all".
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeVisible();
    await page.locator('.file-card-wrapper', { hasText: 'sa-a.jpg' }).click();
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeVisible();
    await expect(page.getByText('2 selected')).toBeVisible();
  });
});
