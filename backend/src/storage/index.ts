import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, readdir, unlink } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { newId } from '../lib/ids';
import { notFound } from '../lib/errors';

/**
 * Per-user filesystem storage (research §5, §10). Each user has an isolated root
 * `DATA_ROOT/users/<userId>/{blobs,thumbs,tmp}`. Blob names are opaque (never
 * derived from user input) and all path resolution is confined to the user root
 * (path-traversal safe — Principle I). Writes are atomic: stream to temp, fsync,
 * then rename into place (FR-014).
 */
export class Storage {
  constructor(private readonly dataRoot: string) {}

  usersDir(): string {
    return join(this.dataRoot, 'users');
  }
  userRoot(userId: string): string {
    return join(this.usersDir(), userId);
  }
  blobsDir(userId: string): string {
    return join(this.userRoot(userId), 'blobs');
  }
  thumbsDir(userId: string): string {
    return join(this.userRoot(userId), 'thumbs');
  }
  tmpDir(userId: string): string {
    return join(this.userRoot(userId), 'tmp');
  }

  async ensureUserDirs(userId: string): Promise<void> {
    await mkdir(this.blobsDir(userId), { recursive: true });
    await mkdir(this.thumbsDir(userId), { recursive: true });
    await mkdir(this.tmpDir(userId), { recursive: true });
  }

  /** Resolve `relative` under `baseDir`, refusing anything that escapes it. */
  private resolveWithin(baseDir: string, relative: string): string {
    const base = resolve(baseDir);
    const abs = resolve(base, relative);
    if (abs !== base && !abs.startsWith(base + sep)) {
      throw notFound();
    }
    return abs;
  }

  blobAbsPath(userId: string, storagePath: string): string {
    return this.resolveWithin(this.blobsDir(userId), storagePath);
  }

  thumbAbsPath(userId: string, nodeId: string): string {
    return this.resolveWithin(this.thumbsDir(userId), `${nodeId}.jpg`);
  }

  /**
   * Stream `source` to a temp file, fsync it, and return the temp path + byte
   * size. The temp file is NOT yet visible as a blob — call {@link commitTemp}
   * to atomically publish it, or {@link discardTemp} to remove it.
   */
  async writeStreamToTemp(
    userId: string,
    source: Readable,
  ): Promise<{ tmpPath: string; size: number }> {
    await mkdir(this.tmpDir(userId), { recursive: true });
    const tmpPath = join(this.tmpDir(userId), `${Date.now()}-${randomBytes(10).toString('hex')}.part`);
    const fh = await open(tmpPath, 'wx');
    try {
      const ws = fh.createWriteStream({ autoClose: false });
      await pipeline(source, ws);
      await fh.sync();
    } catch (err) {
      await fh.close().catch(() => {});
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
    await fh.close();
    const s = await stat(tmpPath);
    return { tmpPath, size: s.size };
  }

  /** Atomically publish a temp file as a blob; returns the relative storage path. */
  async commitTemp(userId: string, tmpPath: string): Promise<{ storagePath: string }> {
    const id = newId();
    const relParts = [id.slice(0, 2), id.slice(2, 4), id];
    const abs = join(this.blobsDir(userId), ...relParts);
    await mkdir(dirname(abs), { recursive: true });
    await rename(tmpPath, abs);
    // fsync the containing directory so the rename is durable across a crash.
    try {
      const dh = await open(dirname(abs));
      await dh.sync();
      await dh.close();
    } catch {
      /* best-effort durability */
    }
    return { storagePath: relParts.join('/') };
  }

  async discardTemp(tmpPath: string): Promise<void> {
    await unlink(tmpPath).catch(() => {});
  }

  async statBlob(userId: string, storagePath: string): Promise<{ size: number }> {
    try {
      const s = await stat(this.blobAbsPath(userId, storagePath));
      return { size: s.size };
    } catch {
      throw notFound();
    }
  }

  openBlobStream(
    userId: string,
    storagePath: string,
    range?: { start: number; end: number },
  ): ReadStream {
    const abs = this.blobAbsPath(userId, storagePath);
    return range
      ? createReadStream(abs, { start: range.start, end: range.end })
      : createReadStream(abs);
  }

  async removeBlob(userId: string, storagePath: string): Promise<void> {
    await unlink(this.blobAbsPath(userId, storagePath)).catch(() => {});
  }

  async removeThumb(userId: string, nodeId: string): Promise<void> {
    await unlink(this.thumbAbsPath(userId, nodeId)).catch(() => {});
  }

  async removeUserRoot(userId: string): Promise<void> {
    await rm(this.userRoot(userId), { recursive: true, force: true });
  }

  /** Remove orphaned temp files older than maxAgeMs across all users. */
  async sweepTempFiles(maxAgeMs: number): Promise<number> {
    let removed = 0;
    const cutoff = Date.now() - maxAgeMs;
    let userIds: string[];
    try {
      userIds = await readdir(this.usersDir());
    } catch {
      return 0;
    }
    for (const userId of userIds) {
      const tmp = this.tmpDir(userId);
      let entries: string[];
      try {
        entries = await readdir(tmp);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const p = join(tmp, entry);
        try {
          const s = await stat(p);
          if (s.mtimeMs < cutoff) {
            await unlink(p);
            removed += 1;
          }
        } catch {
          /* ignore */
        }
      }
    }
    return removed;
  }
}
