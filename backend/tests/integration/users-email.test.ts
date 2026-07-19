import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Owner-managed account emails (006-share-links amendment): the addressing
 * identity the share dialog resolves recipients by. Emails are optional,
 * normalized (trim+lowercase), and unique across accounts.
 */
describe('account email management (006 amendment)', () => {
  let t: TestApp;
  let owner: UserRow;
  let bob: UserRow;
  let ownerCookie: string;
  let bobCookie: string;

  beforeAll(async () => {
    t = await buildTestApp();
    owner = await seedUser(t.services, 'boss', 'boss-password-123', 'owner');
    bob = await seedUser(t.services, 'bob', 'bob-password-123');
    ownerCookie = sessionCookieFor(t.app, t.services, owner.id);
    bobCookie = sessionCookieFor(t.app, t.services, bob.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('creates a user with a normalized email', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: ownerCookie },
      payload: { username: 'carol', password: 'carol-password-123', email: '  Carol@Family.COM ' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { email: string | null; username: string };
    expect(body.email).toBe('carol@family.com');
  });

  it('sets, changes, and clears an email via PATCH', async () => {
    const set = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${bob.id}`,
      headers: { cookie: ownerCookie },
      payload: { email: 'Bob@Family.com' },
    });
    expect(set.statusCode).toBe(200);
    expect((set.json() as { email: string | null }).email).toBe('bob@family.com');

    const clear = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${bob.id}`,
      headers: { cookie: ownerCookie },
      payload: { email: null },
    });
    expect(clear.statusCode).toBe(200);
    expect((clear.json() as { email: string | null }).email).toBeNull();
  });

  it('rejects invalid and duplicate emails; enforces owner-only and uniform 404', async () => {
    const invalid = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${bob.id}`,
      headers: { cookie: ownerCookie },
      payload: { email: 'not-an-email' },
    });
    expect(invalid.statusCode).toBe(400);

    // carol already holds carol@family.com (created above).
    const dup = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${bob.id}`,
      headers: { cookie: ownerCookie },
      payload: { email: 'CAROL@family.com' },
    });
    expect(dup.statusCode).toBe(409);

    const nonOwner = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${owner.id}`,
      headers: { cookie: bobCookie },
      payload: { email: 'x@y.com' },
    });
    expect(nonOwner.statusCode).toBe(403);

    const missing = await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/users/01NOSUCHUSERNOSUCHUSER0000',
      headers: { cookie: ownerCookie },
      payload: { email: 'x@y.com' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('exposes the email through the recipient directory and share DTOs', async () => {
    t.services.users.setEmail(bob.id, 'bob@family.com');

    const dir = await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: ownerCookie } });
    expect(dir.statusCode).toBe(200);
    const entries = dir.json() as Array<{ id: string; username: string; email: string | null }>;
    const bobEntry = entries.find((u) => u.username === 'bob');
    expect(bobEntry?.email).toBe('bob@family.com');
    for (const u of entries) expect(Object.keys(u).sort()).toEqual(['email', 'id', 'username']);

    // A direct share's recipient carries the email for display.
    const rid = t.services.nodes.ensureRootNode(owner.id).id;
    const folder = t.services.nodes.insertFolderNode({ ownerId: owner.id, parentId: rid, name: 'Mail' });
    const share = await t.app.inject({
      method: 'POST',
      url: '/api/shares',
      headers: { cookie: ownerCookie },
      payload: { nodeId: folder.id, kind: 'user', recipientIds: [bob.id] },
    });
    expect(share.statusCode).toBe(201);
    const recipient = (share.json() as { items: Array<{ recipient?: Record<string, unknown> }> }).items[0]
      ?.recipient as Record<string, unknown>;
    expect(recipient.email).toBe('bob@family.com');
    expect(Object.keys(recipient).sort()).toEqual(['email', 'id', 'username']);
  });
});
