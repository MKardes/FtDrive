import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, type TestApp } from '../fixtures/app';

describe('auth (US1, gating)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
    await seedUser(t.services, 'alice', 'alice-password', 'owner');
    await seedUser(t.services, 'bob', 'bob-password-9', 'user');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  function cookieFrom(res: { headers: Record<string, unknown> }): string {
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    return raw.split(';')[0] as string;
  }

  it('logs in with correct credentials and sets a session cookie', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'alice-password' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.username).toBe('alice');
    expect(body.role).toBe('owner');
    expect(body).not.toHaveProperty('passwordHash');
    const setCookie = res.headers['set-cookie'];
    const raw = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? '';
    expect(raw).toContain('ftdrive_session=');
    expect(raw.toLowerCase()).toContain('httponly');
    expect(raw.toLowerCase()).toContain('samesite=lax');
  });

  it('returns a uniform 401 for wrong password and for unknown user', async () => {
    const wrongPw = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'WRONG' },
    });
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'whatever-123' },
    });
    expect(wrongPw.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    // Identical shape + message — no account enumeration.
    expect(wrongPw.json()).toEqual(unknown.json());
    expect(wrongPw.json().error.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me requires a session and returns the user when present', async () => {
    const anon = await t.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anon.statusCode).toBe(401);

    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'bob-password-9' },
    });
    const cookie = cookieFrom(login);
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe('bob');
  });

  it('logout revokes the session (subsequent requests are denied)', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'bob-password-9' },
    });
    const cookie = cookieFrom(login);

    const logout = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const after = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects a tampered/forged session cookie', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'ftdrive_session=not-a-valid-signed-value' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('throttles repeated failed logins with a uniform 429', async () => {
    const tt = await buildTestApp();
    try {
      await seedUser(tt.services, 'carol', 'carol-password', 'user');
      let sawTooMany = false;
      for (let i = 0; i < 8; i += 1) {
        const res = await tt.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'carol', password: 'definitely-wrong' },
        });
        if (res.statusCode === 429) {
          sawTooMany = true;
          expect(res.json().error.code).toBe('TOO_MANY_REQUESTS');
          break;
        }
        expect(res.statusCode).toBe(401);
      }
      expect(sawTooMany).toBe(true);
    } finally {
      await tt.cleanup();
    }
  });
});
