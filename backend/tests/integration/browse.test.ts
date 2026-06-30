import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildTestApp, seedFile, seedUser, sessionCookieFor, rootId, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

async function pngBytes(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: '#3366cc' } })
    .png()
    .toBuffer();
}

describe('browse / search / content / thumbnail (US1)', () => {
  let t: TestApp;
  let alice: UserRow;
  let cookie: string;
  let rid: string;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    cookie = sessionCookieFor(t.app, t.services, alice.id);
    rid = rootId(t.services, alice.id);

    t.services.nodes.insertFolderNode({ ownerId: alice.id, parentId: rid, name: 'Photos' });
    await seedFile(t.services, alice.id, rid, 'notes.txt', Buffer.from('hello world'), 'text/plain');
    await seedFile(t.services, alice.id, rid, 'beach.png', await pngBytes(), 'image/png');
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('denies anonymous access to listings (FR-001)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/folders/root/children' });
    expect(res.statusCode).toBe(401);
  });

  it('lists root children (folders first) for the owner', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const page = res.json();
    expect(page.items).toHaveLength(3);
    expect(page.items[0].type).toBe('folder');
    expect(page.items[0].name).toBe('Photos');
    const names = page.items.map((n: { name: string }) => n.name);
    expect(names).toContain('beach.png');
    expect(names).toContain('notes.txt');
  });

  it('searches by name, case-insensitively (FR-021)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?q=BEACH',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const page = res.json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].name).toBe('beach.png');
  });

  it('streams full content with 200 and Accept-Ranges', async () => {
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    const file = list.json().items.find((n: { name: string }) => n.name === 'notes.txt');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${file.id}/content`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('11');
    expect(res.body).toBe('hello world');
  });

  it('serves a partial range with 206 + Content-Range (video seek)', async () => {
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    const file = list.json().items.find((n: { name: string }) => n.name === 'notes.txt');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${file.id}/content`,
      headers: { cookie, range: 'bytes=0-4' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-4/11');
    expect(res.headers['content-length']).toBe('5');
    expect(res.body).toBe('hello');
  });

  it('generates an image thumbnail (200 image/jpeg)', async () => {
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    const img = list.json().items.find((n: { name: string }) => n.name === 'beach.png');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${img.id}/thumbnail`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('returns 404 for a thumbnail of an unsupported (non-media) file', async () => {
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/folders/root/children',
      headers: { cookie },
    });
    const txt = list.json().items.find((n: { name: string }) => n.name === 'notes.txt');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/files/${txt.id}/thumbnail`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
