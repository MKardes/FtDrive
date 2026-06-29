import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  seedUser,
  sessionCookieFor,
  loginCookie,
  rootId,
  type TestApp,
} from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Owner admin surface (T049, FR-015/022). List/provision/remove users and reset
 * passwords are owner-only (non-owner → 403). Removing a user cascades their
 * nodes + sessions and deletes their on-disk root; a password reset revokes all
 * of that user's sessions.
 */
describe('admin / user management (US4)', () => {
  let t: TestApp;
  let owner: UserRow;
  let ownerCookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    owner = await seedUser(t.services, 'owner', 'owner-password', 'owner');
    ownerCookie = sessionCookieFor(t.app, t.services, owner.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('owner lists users', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((u: { username: string }) => u.username === 'owner')).toBe(true);
    // Password hashes must never be serialized.
    expect(JSON.stringify(res.json())).not.toContain('password');
  });

  it('owner provisions a user who can then log in', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: ownerCookie },
      payload: { username: 'carol', password: 'carol-password' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('user');
    const cookie = await loginCookie(t.app, 'carol', 'carol-password');
    expect(cookie).toContain('ftdrive_session=');
  });

  it('rejects a non-owner with 403', async () => {
    const dave = await seedUser(t.services, 'dave', 'dave-password', 'user');
    const daveCookie = sessionCookieFor(t.app, t.services, dave.id);
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: daveCookie } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('removing a user cascades nodes + sessions + on-disk root', async () => {
    const erin = await seedUser(t.services, 'erin', 'erin-password', 'user');
    const erinCookie = sessionCookieFor(t.app, t.services, erin.id);
    const erinRoot = rootId(t.services, erin.id);
    t.services.nodes.insertFolderNode({ ownerId: erin.id, parentId: erinRoot, name: 'Stuff' });
    const diskRoot = t.services.storage.userRoot(erin.id);
    expect(existsSync(diskRoot)).toBe(true);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${erin.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(del.statusCode).toBe(204);

    // Session no longer valid (cascade), disk root gone, nodes gone.
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: erinCookie } });
    expect(me.statusCode).toBe(401);
    expect(existsSync(diskRoot)).toBe(false);
    expect(t.services.users.getById(erin.id)).toBeUndefined();
  });

  it('an owner cannot remove their own account', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${owner.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it('password reset revokes the user’s sessions and rotates the credential', async () => {
    const frank = await seedUser(t.services, 'frank', 'frank-password', 'user');
    const frankCookie = sessionCookieFor(t.app, t.services, frank.id);

    const res = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${frank.id}/password-reset`,
      headers: { cookie: ownerCookie },
      payload: { newPassword: 'frank-new-password' },
    });
    expect(res.statusCode).toBe(204);

    // Existing session revoked; old password rejected; new password works.
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: frankCookie } });
    expect(me.statusCode).toBe(401);
    const old = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'frank', password: 'frank-password' } });
    expect(old.statusCode).toBe(401);
    const fresh = await loginCookie(t.app, 'frank', 'frank-new-password');
    expect(fresh).toContain('ftdrive_session=');
  });

  it('returns 404 when removing a non-existent user', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/admin/users/01ARZ3NDEKTSV4RRFFQ69G5FAV',
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
