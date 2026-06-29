import { expect, test } from '@playwright/test';
import { seedSampleMedia, uiLogin } from './helpers';

// Seed the owner's drive once before the story's UI assertions. Runs against the
// single deployable (SPA + API on one origin). Each Playwright project (desktop
// + mobile-360) re-runs these, exercising the responsive layout for free.
test.beforeAll(async ({ request }) => {
  await seedSampleMedia(request);
});

test.describe('US1 — private browse, preview, search', () => {
  test('unauthenticated visit is gated to the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /sign in to ftdrive/i })).toBeVisible();
  });

  test('owner signs in and browses their files', async ({ page }) => {
    await uiLogin(page);
    await expect(page.getByText('sample.jpg')).toBeVisible();
    await expect(page.getByText('clip.mp4')).toBeVisible();
  });

  test('opening a photo shows a full-screen viewer served from the content endpoint', async ({
    page,
  }) => {
    await uiLogin(page);
    await page.getByTitle('sample.jpg').click();
    const img = page.getByRole('img', { name: /sample\.jpg/i });
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', /\/api\/files\/.+\/content$/);
  });

  test('opening a video renders a player from the streaming endpoint', async ({ page }) => {
    await uiLogin(page);
    await page.getByTitle('clip.mp4').click();
    const video = page.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('src', /\/api\/files\/.+\/content$/);
  });

  test('name search filters to matching files', async ({ page }) => {
    await uiLogin(page);
    const search = page.getByLabel(/search files/i);
    await search.fill('sample');
    await expect(page.getByText('sample.jpg')).toBeVisible();
    await expect(page.getByText('clip.mp4')).toHaveCount(0);
  });
});
