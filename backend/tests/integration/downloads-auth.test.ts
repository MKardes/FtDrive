import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../fixtures/app';

/** Every downloads endpoint denies unauthenticated access (FR-011, T023, gating). */
describe('downloads: auth required on every endpoint (gating)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('rejects every downloads endpoint with 401 when unauthenticated', async () => {
    const GUESS = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const cases: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: unknown }> = [
      { method: 'POST', url: '/api/downloads/examine', payload: { url: 'http://93.184.216.34/ok' } },
      { method: 'GET', url: '/api/downloads' },
      { method: 'POST', url: '/api/downloads', payload: { url: 'http://93.184.216.34/ok' } },
      { method: 'DELETE', url: '/api/downloads' },
      { method: 'GET', url: `/api/downloads/${GUESS}` },
      { method: 'DELETE', url: `/api/downloads/${GUESS}` },
      { method: 'POST', url: `/api/downloads/${GUESS}/cancel` },
      { method: 'POST', url: `/api/downloads/${GUESS}/retry` },
    ];

    for (const c of cases) {
      const res = await t.app.inject({ method: c.method, url: c.url, payload: c.payload as object });
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(401);
      expect(res.json().error.code, `${c.method} ${c.url}`).toBe('UNAUTHORIZED');
    }
  });
});
