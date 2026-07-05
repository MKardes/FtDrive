import { rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, sessionCookieFor } from '../fixtures/app';
import { downloads } from '../../src/db/schema';

/**
 * Startup reconciliation (T039): a download left `examining`/`downloading` by
 * a crash is re-queued (or failed once attempts are exhausted) the next time
 * the server starts, with no partial file ever surfacing via the API.
 */
describe('downloads: startup reconciliation (US2)', () => {
  it('re-queues a row stuck mid-transfer from a simulated crash', async () => {
    const t1 = await buildTestApp();
    const alice = await seedUser(t1.services, 'alice', 'alice-password');
    const cookie = sessionCookieFor(t1.app, t1.services, alice.id);

    // Simulate a crash: insert a row already in `downloading` (bypassing the
    // worker, so nothing is actually running for it).
    const now = Date.now();
    const stuckId = '01STUCKDOWNLOAD00000000001';
    t1.services.db
      .insert(downloads)
      .values({
        id: stuckId,
        ownerId: alice.id,
        sourceUrl: 'http://93.184.216.34/ok',
        destinationParentId: null,
        selection: null,
        title: 'Stuck video',
        status: 'downloading',
        bytesDownloaded: 100,
        totalBytes: 1000,
        nodeId: null,
        errorCode: null,
        errorMessage: null,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        finishedAt: null,
      })
      .run();

    // "Restart": close this app (stops its worker) and build a new one against
    // the same on-disk database + data root.
    await t1.app.close();
    const t2 = await buildTestApp({ dataRoot: t1.config.dataRoot, databasePath: t1.config.databasePath });

    try {
      const res = await t2.app.inject({ method: 'GET', url: `/api/downloads/${stuckId}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Requeued: back to `queued`, bytes reset, attempt incremented — and the
      // worker will now pick it up for real and complete it.
      expect(body.attempt).toBe(1);
      expect(['queued', 'examining', 'downloading', 'completed']).toContain(body.status);

      const deadline = Date.now() + 5000;
      let finalStatus = body.status;
      while (finalStatus !== 'completed' && Date.now() < deadline) {
        const poll = await t2.app.inject({ method: 'GET', url: `/api/downloads/${stuckId}`, headers: { cookie } });
        finalStatus = poll.json().status;
        if (finalStatus === 'failed') break;
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(finalStatus).toBe('completed');
    } finally {
      await t2.app.close();
      rmSync(t2.dir, { recursive: true, force: true });
      rmSync(t1.dir, { recursive: true, force: true });
    }
  });

  it('fails a stuck row as retryable once reconciliation attempts are exhausted', async () => {
    const t1 = await buildTestApp();
    const alice = await seedUser(t1.services, 'alice', 'alice-password');
    const cookie = sessionCookieFor(t1.app, t1.services, alice.id);

    const now = Date.now();
    const stuckId = '01STUCKDOWNLOAD00000000002';
    t1.services.db
      .insert(downloads)
      .values({
        id: stuckId,
        ownerId: alice.id,
        sourceUrl: 'http://93.184.216.34/ok',
        destinationParentId: null,
        selection: null,
        title: null,
        status: 'examining',
        bytesDownloaded: 0,
        totalBytes: null,
        nodeId: null,
        errorCode: null,
        errorMessage: null,
        attempt: 2, // one more requeue would be attempt 3 == exhausted
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        finishedAt: null,
      })
      .run();

    await t1.app.close();
    const t2 = await buildTestApp({ dataRoot: t1.config.dataRoot, databasePath: t1.config.databasePath });
    try {
      const row = t2.services.db.select().from(downloads).where(eq(downloads.id, stuckId)).get();
      expect(row?.status).toBe('failed');
      expect(row?.errorCode).toBe('INTERRUPTED');

      const res = await t2.app.inject({ method: 'GET', url: `/api/downloads/${stuckId}`, headers: { cookie } });
      expect(res.json().status).toBe('failed');
    } finally {
      await t2.app.close();
      rmSync(t2.dir, { recursive: true, force: true });
      rmSync(t1.dir, { recursive: true, force: true });
    }
  });
});
