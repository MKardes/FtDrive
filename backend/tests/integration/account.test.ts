import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, loginCookie, type TestApp } from '../fixtures/app';

/**
 * Self-service password change (T050, FR-022). Requires the current password,
 * enforces the minimum policy on the new one, and revokes every OTHER session of
 * the user while keeping the current one signed in.
 */
describe('account / self password change (US4)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
    await seedUser(t.services, 'alice', 'alice-password', 'user');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('changes the password with the correct current one and rotates the credential', async () => {
    const cookie = await loginCookie(t.app, 'alice', 'alice-password');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: { cookie },
      payload: { currentPassword: 'alice-password', newPassword: 'alice-new-password' },
    });
    expect(res.statusCode).toBe(204);

    const oldLogin = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'alice', password: 'alice-password' } });
    expect(oldLogin.statusCode).toBe(401);
    const newCookie = await loginCookie(t.app, 'alice', 'alice-new-password');
    expect(newCookie).toContain('ftdrive_session=');
  });

  it('rejects a wrong current password with 401', async () => {
    const cookie = await loginCookie(t.app, 'alice', 'alice-new-password');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: { cookie },
      payload: { currentPassword: 'not-the-password', newPassword: 'whatever-strong-pass' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a too-short new password with 400', async () => {
    const cookie = await loginCookie(t.app, 'alice', 'alice-new-password');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: { cookie },
      payload: { currentPassword: 'alice-new-password', newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('revokes other sessions but keeps the current one', async () => {
    const bob = await seedUser(t.services, 'bob', 'bob-password-1', 'user');
    const otherCookie = sessionCookieFor(t.app, t.services, bob.id); // a second, "elsewhere" session
    const currentCookie = await loginCookie(t.app, 'bob', 'bob-password-1');

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: { cookie: currentCookie },
      payload: { currentPassword: 'bob-password-1', newPassword: 'bob-password-2' },
    });
    expect(res.statusCode).toBe(204);

    const otherMe = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: otherCookie } });
    expect(otherMe.statusCode).toBe(401); // revoked
    const currentMe = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: currentCookie } });
    expect(currentMe.statusCode).toBe(200); // still signed in
    expect(currentMe.json().username).toBe('bob');
  });
});
