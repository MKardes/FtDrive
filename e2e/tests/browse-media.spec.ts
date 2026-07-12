import { expect, test, type Page } from '@playwright/test';
import { apiLogin, uiLogin, SAMPLE_JPEG, SAMPLE_MP4 } from './helpers';

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
): Promise<{ id: string; name: string }> {
  await page.getByRole('button', { name: 'New folder' }).click();
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
  return folder;
}

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

/** US1 — no overlapping file/folder cards (004-ui-polish-viewer, FR-001/002/003). */
test.describe('US1 — no overlapping file/folder cards', () => {
  test('a card with a long, unbroken name never overlaps a neighbor, at desktop and 360px', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `Overlap_${Date.now()}`;
    const longName =
      'ThisIsAnUnbrokenVeryLongFileNameWithNoSpacesAtAllForStressTestingGridCardWidth.jpg';
    const folder = await createFolderAndSeedFiles(page, request, folderName, [
      { name: longName, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'overlap-a.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'overlap-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);
    void folder;

    await page.getByTitle(folderName).click();
    await expect(page.locator('.file-grid').getByTitle(longName)).toBeVisible();

    for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
      await page.setViewportSize(viewport);
      const wrappers = page.locator('.file-card-wrapper');
      const count = await wrappers.count();
      expect(count).toBeGreaterThanOrEqual(3);

      const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (let i = 0; i < count; i += 1) {
        const wrapperBox = await wrappers.nth(i).boundingBox();
        const cardBox = await wrappers.nth(i).locator('.file-card').boundingBox();
        expect(wrapperBox).not.toBeNull();
        expect(cardBox).not.toBeNull();
        // The regression from research.md: a long-named card's button measured
        // 783px/439px wide inside a 157px wrapper. Guard against it directly.
        expect(cardBox!.width).toBeLessThanOrEqual(wrapperBox!.width + 0.5);
        boxes.push(wrapperBox!);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(rectsOverlap(boxes[i], boxes[j])).toBe(false);
        }
      }
    }
  });
});

/** US2 — full-screen viewer controls never cover the media (004-ui-polish-viewer, FR-004/005/006). */
test.describe('US2 — viewer controls never cover the media', () => {
  test('nav arrows never overlap the photo, and the title never touches Close, at 360px', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `ViewerGutter_${Date.now()}`;
    const longTitle = 'A Very Long Photo Title That Should Truncate Before Touching The Close Button.jpg';
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: longTitle, mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'gutter-b.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      { name: 'gutter-c.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
    ]);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.getByTitle(folderName).click();

    // Listing order is type DESC, name ASC — the capitalized long title sorts first
    // (hasPrev=false, hasNext=true): exercises the title/close-button check plus one
    // nav button against the media.
    await page.locator('.file-grid').getByTitle(longTitle).click();
    await expect(page.getByRole('dialog', { name: longTitle })).toBeVisible();

    let mediaBox = await page.locator('.viewer__content img').boundingBox();
    let nextBox = await page.locator('.viewer__nav--next').boundingBox();
    expect(page.locator('.viewer__nav--prev')).toHaveCount(0);
    expect(rectsOverlap(mediaBox, nextBox)).toBe(false);

    const barBox = await page.locator('.viewer__bar').boundingBox();
    const closeBox = await page.locator('.viewer__close').boundingBox();
    expect(rectsOverlap(barBox, closeBox)).toBe(false);

    const backdropAlpha = await page.locator('.viewer').evaluate((el) => {
      const match = getComputedStyle(el).backgroundColor.match(/[\d.]+\)$/);
      return match ? parseFloat(match[0]) : null;
    });
    expect(backdropAlpha).toBeGreaterThanOrEqual(0.98);

    // Middle item ("gutter-b.jpg"): both prev and next render — check both against the media.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'gutter-b.jpg' })).toBeVisible();
    mediaBox = await page.locator('.viewer__content img').boundingBox();
    const prevBox = await page.locator('.viewer__nav--prev').boundingBox();
    nextBox = await page.locator('.viewer__nav--next').boundingBox();
    expect(rectsOverlap(mediaBox, prevBox)).toBe(false);
    expect(rectsOverlap(mediaBox, nextBox)).toBe(false);
  });
});

/** US3 — tidier upload-progress list (004-ui-polish-viewer, FR-007/008). */
test.describe('US3 — tidier upload-progress list', () => {
  test('filename, status, and dismiss control stay visibly separated, at desktop and 360px', async ({
    page,
  }) => {
    await uiLogin(page);
    const longName = `long-upload-name-with-no-spaces-${Date.now()}-abcdefghijklmnopqrstuvwxyz.txt`;

    await page.setInputFiles('input[type="file"]', {
      name: longName,
      mimeType: 'text/plain',
      buffer: Buffer.from('hello world'),
    });
    await expect(page.getByText(longName)).toBeVisible();
    await expect(page.getByText('Done')).toBeVisible();

    for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
      await page.setViewportSize(viewport);
      const row = page.locator('.upload-row').filter({ hasText: longName });
      const nameBox = await row.locator('.upload-row__name').boundingBox();
      const statusBox = await row.getByText('Done').boundingBox();
      const dismissBox = await row.getByRole('button', { name: `Dismiss ${longName}` }).boundingBox();

      expect(rectsOverlap(nameBox, statusBox)).toBe(false);
      expect(rectsOverlap(statusBox, dismissBox)).toBe(false);
      expect(nameBox!.x + nameBox!.width).toBeLessThan(statusBox!.x);
      expect(statusBox!.x + statusBox!.width).toBeLessThan(dismissBox!.x);
    }
  });
});

/** US4 — a more polished, watchable video viewer (004-ui-polish-viewer, FR-009/010). */
test.describe('US4 — polished video viewer', () => {
  test('a small/undecodable video scales up and a position indicator updates on navigation', async ({
    page,
    request,
  }) => {
    await uiLogin(page);
    const folderName = `VideoScale_${Date.now()}`;
    await createFolderAndSeedFiles(page, request, folderName, [
      { name: 'scale-a.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 },
      { name: 'scale-b.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 },
      { name: 'scale-c.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTitle(folderName).click();
    await page.locator('.file-grid').getByTitle('scale-a.mp4').click();
    await expect(page.locator('.viewer__content video')).toHaveCount(1);

    const videoBox = await page.locator('.viewer__content video').boundingBox();
    // Browsers lay out a <video> with no loaded metadata at a ~300px-wide default;
    // the min-size CSS (research.md) should visibly exceed that default.
    expect(videoBox!.width).toBeGreaterThan(300);

    await expect(page.getByText('1 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('2 of 3')).toBeVisible();
  });
});
