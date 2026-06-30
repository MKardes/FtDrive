import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, seedUser, type TestApp } from '../fixtures/app';
import type { UserRow } from '../../src/db/schema';

/**
 * Crash-safety of uploads (T041, FR-014/SC-008). An interrupted write must leave
 * NO partial/corrupt blob and must discard its temp file. We exercise the
 * storage choke point directly since `temp → fsync → atomic rename` is where the
 * guarantee lives: a blob only ever becomes visible after a successful commit.
 */
describe('upload crash-safety (US2)', () => {
  let t: TestApp;
  let alice: UserRow;

  beforeAll(async () => {
    t = await buildTestApp();
    alice = await seedUser(t.services, 'alice', 'alice-password', 'owner');
    await t.services.storage.ensureUserDirs(alice.id);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('a stream that errors mid-write leaves no temp and no blob', async () => {
    const failing = new Readable({
      read() {
        this.push(Buffer.from('partial data'));
        this.destroy(new Error('connection reset'));
      },
    });

    await expect(t.services.storage.writeStreamToTemp(alice.id, failing)).rejects.toThrow();

    const tmp = await readdir(t.services.storage.tmpDir(alice.id)).catch(() => []);
    expect(tmp).toHaveLength(0); // temp cleaned up on failure
    const blobs = await readdir(t.services.storage.blobsDir(alice.id)).catch(() => []);
    expect(blobs).toHaveLength(0); // nothing published as a blob
  });

  it('a written-but-not-committed temp never becomes a visible blob', async () => {
    const { tmpPath } = await t.services.storage.writeStreamToTemp(
      alice.id,
      Readable.from(Buffer.from('uncommitted bytes')),
    );
    // Simulate a crash before commit: discard the temp instead of renaming it in.
    await t.services.storage.discardTemp(tmpPath);

    const blobs = await readdir(t.services.storage.blobsDir(alice.id)).catch(() => []);
    expect(blobs).toHaveLength(0);
  });

  it('the temp sweep removes orphaned partial files', async () => {
    await t.services.storage.writeStreamToTemp(alice.id, Readable.from(Buffer.from('orphan')));
    const before = await readdir(t.services.storage.tmpDir(alice.id));
    expect(before.length).toBeGreaterThan(0);

    const removed = await t.services.storage.sweepTempFiles(-1); // everything is "older than" -1ms ago
    expect(removed).toBeGreaterThan(0);
    const after = await readdir(t.services.storage.tmpDir(alice.id));
    expect(after).toHaveLength(0);
  });
});
