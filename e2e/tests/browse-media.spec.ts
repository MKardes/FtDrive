import { expect, test, type Page } from '@playwright/test';
import { apiLogin, uiLogin, SAMPLE_JPEG, SAMPLE_MP4 } from './helpers';

/**
 * Drop a file onto `selector` by constructing a real `DataTransfer`/`File` in
 * the page (Playwright has no OS-level drag simulation, so this is the
 * standard recipe for testing HTML5 drop handlers end-to-end).
 */
async function dropFile(
  page: Page,
  selector: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, bytes }) => {
      const dt = new DataTransfer();
      const f = new File([new Uint8Array(bytes)], name, { type: mimeType });
      dt.items.add(f);
      return dt;
    },
    { name: file.name, mimeType: file.mimeType, bytes: Array.from(file.buffer) },
  );
  await page.dispatchEvent(selector, 'dragenter', { dataTransfer });
  await page.dispatchEvent(selector, 'drop', { dataTransfer });
}

/** US1 — drag-and-drop upload (T002, FR-001/002/003/005). */
test.describe('US1 — drag-and-drop upload', () => {
  test('dropping a file onto the folder view uploads it', async ({ page }) => {
    await uiLogin(page);
    const name = `drop-${Date.now()}.jpg`;

    await dropFile(page, '.file-grid', { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG });

    await expect(page.getByText('Done')).toBeVisible();
    await expect(page.locator('.file-grid').getByTitle(name)).toBeVisible();
  });

  test('dropping a same-named file keeps both copies', async ({ page }) => {
    await uiLogin(page);
    const name = `drop-dup-${Date.now()}.jpg`;
    const file = { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG };

    await dropFile(page, '.file-grid', file);
    await expect(page.locator('.file-grid').getByTitle(name)).toBeVisible();

    await dropFile(page, '.file-grid', file);
    await expect(page.getByText(/was kept as/)).toBeVisible();
    await expect(
      page.locator('.file-grid').getByTitle(new RegExp(`${name.replace('.jpg', '')} \\(2\\)\\.jpg`)),
    ).toBeVisible();
  });

  test('a drag with no files is ignored (no upload, no error)', async ({ page }) => {
    await uiLogin(page);
    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'not a file');
      return dt;
    });
    await page.dispatchEvent('.toolbar', 'drop', { dataTransfer });
    await expect(page.getByText('Done')).toHaveCount(0);
  });

  test('a drop is ignored while viewing search results (FR-004)', async ({ page }) => {
    await uiLogin(page);
    await page.getByLabel('Search files').fill('anything');
    await expect(page.getByText(/Search results for/)).toBeVisible();

    await dropFile(page, '.toolbar', {
      name: `drop-while-searching-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.getByText('Done')).toHaveCount(0);
  });

  test('a drop is ignored while a dialog is open (FR-006)', async ({ page }) => {
    await uiLogin(page);
    await page.getByRole('button', { name: 'New folder' }).click();
    await expect(page.getByLabel('Folder name')).toBeVisible();

    await dropFile(page, '.toolbar', {
      name: `drop-while-dialog-open-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.getByText('Done')).toHaveCount(0);

    // The dialog itself is unaffected by the ignored drop.
    await expect(page.getByLabel('Folder name')).toBeVisible();
  });
});

/** US2 — full-screen carousel navigation (T007, FR-007..FR-012). */
test.describe('US2 — carousel navigation', () => {
  test('steps forward/back through a folder and hides controls at the ends', async ({ page, request }) => {
    await uiLogin(page);
    const folderName = `Carousel_${Date.now()}`;

    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill(folderName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTitle(folderName)).toBeVisible();

    await apiLogin(request);
    const rootListing = await request.get('/api/folders/root/children?limit=200');
    const folder = (await rootListing.json()).items.find((n: { name: string }) => n.name === folderName);
    expect(folder).toBeTruthy();

    const names = ['nav-a.jpg', 'nav-b.jpg', 'nav-c.jpg'];
    for (const name of names) {
      await request.post('/api/files', {
        multipart: { parentId: folder.id, file: { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG } },
      });
    }

    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle('nav-a.jpg')).toBeVisible();

    await page.locator('.file-grid').getByTitle('nav-a.jpg').click();
    await expect(page.getByRole('dialog', { name: 'nav-a.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'nav-b.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'nav-c.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog', { name: 'nav-b.jpg' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('navigating past the last loaded item loads the next page automatically (FR-010)', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `Paginated_${Date.now()}`;

    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill(folderName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTitle(folderName)).toBeVisible();

    await apiLogin(request);
    const rootListing = await request.get('/api/folders/root/children?limit=200');
    const folder = (await rootListing.json()).items.find((n: { name: string }) => n.name === folderName);
    expect(folder).toBeTruthy();

    // Default page size is 50 (backend/src/lib/pagination.ts); 52 files span two pages.
    for (let i = 1; i <= 52; i += 1) {
      const name = `nav-${String(i).padStart(2, '0')}.jpg`;
      await request.post('/api/files', {
        multipart: { parentId: folder.id, file: { name, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG } },
      });
    }

    await page.getByTitle(folderName).click();
    // Last item on the first loaded page.
    await page.locator('.file-grid').getByTitle('nav-50.jpg').click();
    await expect(page.getByRole('dialog', { name: 'nav-50.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'nav-51.jpg' })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'nav-52.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  });

  test('a video stops playing before the next item is shown (FR-009)', async ({ page, request }) => {
    await uiLogin(page);
    const folderName = `VideoNav_${Date.now()}`;

    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill(folderName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTitle(folderName)).toBeVisible();

    await apiLogin(request);
    const rootListing = await request.get('/api/folders/root/children?limit=200');
    const folder = (await rootListing.json()).items.find((n: { name: string }) => n.name === folderName);
    expect(folder).toBeTruthy();

    await request.post('/api/files', {
      multipart: { parentId: folder.id, file: { name: 'clip-a.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 } },
    });
    await request.post('/api/files', {
      multipart: { parentId: folder.id, file: { name: 'clip-b.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 } },
    });
    const listing = await request.get(`/api/folders/${folder.id}/children?limit=10`);
    const items: Array<{ id: string; name: string }> = (await listing.json()).items;
    const clipB = items.find((n) => n.name === 'clip-b.mp4');
    expect(clipB).toBeTruthy();

    await page.getByTitle(folderName).click();
    await page.locator('.file-grid').getByTitle('clip-a.mp4').click();
    await expect(page.locator('.viewer__content video')).toHaveCount(1);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'clip-b.mp4' })).toBeVisible();
    // A fresh <video> mounted at the new node's src (not the same element with src swapped) —
    // proof playback fully stopped before the next item appeared (FR-009).
    await expect(page.locator('.viewer__content video')).toHaveAttribute(
      'src',
      `/api/files/${clipB!.id}/content`,
    );
  });
});
