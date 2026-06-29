import { expect, test, type Page } from '@playwright/test';
import { apiLogin, uiLogin, SAMPLE_JPEG } from './helpers';

/**
 * US4 — multi-user privacy (T057). The owner provisions a user through the Users
 * page; that user signs in to a fully isolated, empty drive and cannot reach the
 * owner's files (uniform 404). The user changes their own password (Account),
 * then the owner removes them. Runs on desktop + 360px via the project matrix.
 */

async function uiLoginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('US4 — provisioning, isolation, account', () => {
  test('owner provisions a user who is isolated, can change password, and can be removed', async ({
    page,
    request,
    browser,
  }) => {
    const suffix = Date.now();
    const username = `tester_${suffix}`;
    const password = 'tester-password-1';
    const newPassword = 'tester-password-2';

    // Owner has at least one private file to test cross-user access against.
    await uiLogin(page);
    await apiLogin(request);
    await page.getByLabel('Choose files to upload').setInputFiles({
      name: `owner-private-${suffix}.jpg`,
      mimeType: 'image/jpeg',
      buffer: SAMPLE_JPEG,
    });
    await expect(page.getByText('Done')).toBeVisible();
    const ownerListing = await (await request.get('/api/folders/root/children?limit=200')).json();
    const ownerNode = ownerListing.items.find((n: { type: string }) => n.type === 'file');
    expect(ownerNode).toBeTruthy();

    // Owner provisions the new user via the Users page.
    await page.goto('/admin');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel(/Temporary password/i).fill(password);
    await page.getByRole('button', { name: /add user/i }).click();
    await expect(page.locator('.list-row', { hasText: username })).toBeVisible();

    // The new user signs in to a separate browser context: empty, isolated drive.
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await uiLoginAs(userPage, username, password);
    await expect(userPage.getByText('This folder is empty.')).toBeVisible();

    // Cross-user access to the owner's file is a uniform 404 (Principle II).
    const denied = await userPage.request.get(`/api/files/${ownerNode.id}/content`);
    expect(denied.status()).toBe(404);

    // The user changes their own password (Account); the old one stops working.
    await userPage.goto('/account');
    await userPage.getByLabel('Current password').fill(password);
    await userPage.getByLabel(/^New password/i).fill(newPassword);
    await userPage.getByLabel('Confirm new password').fill(newPassword);
    await userPage.getByRole('button', { name: /change password/i }).click();
    await expect(userPage.getByText(/password changed/i)).toBeVisible();
    await userContext.close();
    // (Old-password rejection + session revocation are proven by the backend
    // account/admin integration tests; we avoid wrong-password logins here so
    // the IP login-throttle never trips mid-suite.)

    // Owner removes the user; the row disappears.
    await page.bringToFront();
    const row = page.locator('.list-row', { hasText: username });
    await row.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Remove user' }).click();
    await expect(page.locator('.list-row', { hasText: username })).toHaveCount(0);
  });
});
