import type { APIRequestContext, Page } from '@playwright/test';

export const E2E_USERNAME = process.env.E2E_USERNAME ?? 'owner';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'owner-password-123';

// A minimal but valid 1x1 JPEG so the media layer (sharp) can generate a real
// thumbnail. Video bytes are arbitrary — ffmpeg may be absent, in which case the
// poster degrades to `unsupported`, which is the behaviour we want to exercise.
const SAMPLE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
  'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
  'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
  'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
  '5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
  'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk' +
  'NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE' +
  'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk' +
  '5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

export const SAMPLE_JPEG = Buffer.from(SAMPLE_JPEG_BASE64, 'base64');
export const SAMPLE_MP4 = Buffer.from('e2e-sample-video-bytes-not-a-real-codec', 'utf8');

/** Log in through the JSON API and return an authenticated request context. */
export async function apiLogin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { username: E2E_USERNAME, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`E2E login failed (${res.status()}). Seed an owner named "${E2E_USERNAME}".`);
  }
}

/**
 * Ensure the owner's root holds the sample photo + clip. Idempotent: skips
 * uploads whose names already exist so repeated runs (and the desktop/mobile
 * project matrix) don't pile up duplicates.
 */
export async function seedSampleMedia(request: APIRequestContext): Promise<void> {
  await apiLogin(request);
  const listing = await request.get('/api/folders/root/children?limit=100');
  const names = new Set<string>(
    (listing.ok() ? ((await listing.json()).items ?? []) : []).map((n: { name: string }) => n.name),
  );

  if (!names.has('sample.jpg')) {
    await request.post('/api/files', {
      multipart: {
        parentId: 'root',
        file: { name: 'sample.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPEG },
      },
    });
  }
  if (!names.has('clip.mp4')) {
    await request.post('/api/files', {
      multipart: {
        parentId: 'root',
        file: { name: 'clip.mp4', mimeType: 'video/mp4', buffer: SAMPLE_MP4 },
      },
    });
  }
}

/**
 * Open the sidebar drawer when the app is at mobile width (007 drive-style
 * shell): below 900px the sidebar hides behind the "Open navigation" button.
 * No-op on desktop or when the drawer is already open.
 */
export async function ensureSidebar(page: Page): Promise<void> {
  const hamburger = page.getByRole('button', { name: 'Open navigation' });
  if (await hamburger.isVisible()) {
    if ((await page.locator('.sidebar--open').count()) === 0) {
      await hamburger.click();
    }
  }
}

/** Navigate to a main area via the 007 sidebar (drawer-aware). */
export async function gotoSection(page: Page, name: string): Promise<void> {
  await ensureSidebar(page);
  await page.getByRole('link', { name, exact: true }).click();
}

/** Open the sidebar "New" menu and choose one of its actions (007, FR-002). */
export async function newMenuAction(
  page: Page,
  item: 'New folder' | 'Upload files' | 'Download from web',
): Promise<void> {
  await ensureSidebar(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/**
 * Click "Load more" until every page of the current listing is loaded. Keeps
 * assertions about freshly-created items stable when the shared e2e root has
 * accumulated more than one page of entries across project runs.
 */
export async function revealAllPages(page: Page): Promise<void> {
  for (;;) {
    // The button reads "Loading…" while a page is in flight — keep waiting
    // through that state instead of concluding pagination is done.
    const pending = page.getByRole('button', { name: /^(Load more|Loading…)$/ });
    if ((await pending.count()) === 0) break;
    const clickable = page.getByRole('button', { name: 'Load more' });
    if ((await clickable.count()) > 0) {
      // dispatchEvent: the fixed upload tray may sit over the button's viewport
      // position on small screens (a user would scroll or collapse the tray).
      await clickable.dispatchEvent('click');
    }
    await page.waitForTimeout(250);
  }
}

/** Sign in through the actual UI and land on the authenticated Browse view. */
export async function uiLogin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(E2E_USERNAME);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
