import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client';
import { downloads, type DownloadRow } from '../../db/schema';
import { notFound, conflict } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { clampLimit } from '../../lib/pagination';

/**
 * Owner-scoped `downloads` data-access layer — the per-user ISOLATION CHOKE
 * POINT for this feature (Principle II), mirroring `NodeRepository`. EVERY
 * query is filtered by `owner_id`; {@link getOwnedDownloadOrThrow404} re-checks
 * ownership before any caller can act on a row. A non-owned OR non-existent
 * download yields the SAME 404.
 */

export type DownloadStatus = DownloadRow['status'];
export const ACTIVE_STATUSES: DownloadStatus[] = ['queued', 'examining', 'downloading'];
export const TERMINAL_STATUSES: DownloadStatus[] = ['completed', 'failed', 'canceled'];

export interface DownloadDto {
  id: string;
  sourceUrl: string;
  destinationFolderId: string | null;
  title: string | null;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number | null;
  nodeId: string | null;
  nodePresent: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** `nodePresent` is enriched by the service layer (needs the nodes table). */
export function toDownloadDto(row: DownloadRow, nodePresent: boolean | null = null): DownloadDto {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    destinationFolderId: row.destinationParentId,
    title: row.title,
    status: row.status,
    bytesDownloaded: row.bytesDownloaded,
    totalBytes: row.totalBytes,
    nodeId: row.nodeId,
    nodePresent: row.nodeId ? nodePresent : null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    attempt: row.attempt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

interface DownloadCursor {
  ca: number;
  i: string;
}
function encodeCursor(row: { createdAt: number; id: string }): string {
  return Buffer.from(JSON.stringify({ ca: row.createdAt, i: row.id }), 'utf8').toString('base64url');
}
function decodeCursor(raw: string | undefined): DownloadCursor | null {
  if (!raw) return null;
  try {
    const obj: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as DownloadCursor).ca === 'number' &&
      typeof (obj as DownloadCursor).i === 'string'
    ) {
      return obj as DownloadCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export class DownloadRepository {
  constructor(private readonly db: DrizzleDb) {}

  insert(input: {
    ownerId: string;
    sourceUrl: string;
    destinationParentId: string | null;
    selection: string | null;
  }): DownloadRow {
    const now = Date.now();
    const row: DownloadRow = {
      id: newId(),
      ownerId: input.ownerId,
      sourceUrl: input.sourceUrl,
      destinationParentId: input.destinationParentId,
      selection: input.selection,
      title: null,
      status: 'queued',
      bytesDownloaded: 0,
      totalBytes: null,
      nodeId: null,
      errorCode: null,
      errorMessage: null,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    };
    this.db.insert(downloads).values(row).run();
    return row;
  }

  getOwned(ownerId: string, id: string): DownloadRow | undefined {
    return this.db
      .select()
      .from(downloads)
      .where(and(eq(downloads.id, id), eq(downloads.ownerId, ownerId)))
      .get();
  }

  getOwnedDownloadOrThrow404(ownerId: string, id: string): DownloadRow {
    const row = this.getOwned(ownerId, id);
    if (!row) throw notFound();
    return row;
  }

  countActiveForOwner(ownerId: string): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(downloads)
      .where(and(eq(downloads.ownerId, ownerId), inArray(downloads.status, ACTIVE_STATUSES)))
      .get();
    return row?.count ?? 0;
  }

  /** Sum of `bytesDownloaded`/`totalBytes` isn't tracked here — quota uses live node sizes (service layer). */
  listByOwner(
    ownerId: string,
    opts: { cursor?: string; limit?: number; status?: 'active' | 'terminal' },
  ): Page<DownloadRow> {
    const limit = clampLimit(opts.limit);
    const cursor = decodeCursor(opts.cursor);
    const conditions = [eq(downloads.ownerId, ownerId)];
    if (opts.status === 'active') conditions.push(inArray(downloads.status, ACTIVE_STATUSES));
    if (opts.status === 'terminal') conditions.push(inArray(downloads.status, TERMINAL_STATUSES));
    if (cursor) {
      conditions.push(
        or(
          lt(downloads.createdAt, cursor.ca),
          and(eq(downloads.createdAt, cursor.ca), lt(downloads.id, cursor.i)),
        ) as SQL,
      );
    }

    const rows = this.db
      .select()
      .from(downloads)
      .where(and(...conditions))
      .orderBy(desc(downloads.createdAt), desc(downloads.id))
      .limit(limit + 1)
      .all();

    let nextCursor: string | null = null;
    let items = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      if (last) nextCursor = encodeCursor(last);
      items = rows.slice(0, limit);
    }
    return { items, nextCursor };
  }

  /**
   * Claim the globally-oldest `queued` job whose owner currently has fewer
   * than `maxConcurrencyPerUser` active jobs (FR-015), atomically marking it
   * `examining`. Returns undefined if nothing is claimable right now.
   */
  claimNextQueued(maxConcurrencyPerUser: number): DownloadRow | undefined {
    return this.db.transaction((tx) => {
      const candidates = tx
        .select()
        .from(downloads)
        .where(eq(downloads.status, 'queued'))
        .orderBy(asc(downloads.createdAt), asc(downloads.id))
        .all();

      for (const candidate of candidates) {
        const activeRow = tx
          .select({ count: sql<number>`count(*)` })
          .from(downloads)
          .where(and(eq(downloads.ownerId, candidate.ownerId), inArray(downloads.status, ACTIVE_STATUSES)))
          .get();
        const activeCount = activeRow?.count ?? 0;
        if (activeCount < maxConcurrencyPerUser) {
          const now = Date.now();
          tx.update(downloads)
            .set({ status: 'examining', startedAt: now, updatedAt: now })
            .where(eq(downloads.id, candidate.id))
            .run();
          return { ...candidate, status: 'examining', startedAt: now, updatedAt: now };
        }
      }
      return undefined;
    });
  }

  /** Transition an in-flight job from `examining` to `downloading`, recording resolved metadata. */
  markDownloading(id: string, patch: { title?: string | null; totalBytes?: number | null } = {}): void {
    this.db
      .update(downloads)
      .set({ status: 'downloading', updatedAt: Date.now(), ...patch })
      .where(eq(downloads.id, id))
      .run();
  }

  setProgress(id: string, bytesDownloaded: number, totalBytes?: number | null): void {
    const patch: Partial<DownloadRow> = { bytesDownloaded, updatedAt: Date.now() };
    if (totalBytes !== undefined) patch.totalBytes = totalBytes;
    this.db.update(downloads).set(patch).where(eq(downloads.id, id)).run();
  }

  markCompleted(id: string, nodeId: string): void {
    const now = Date.now();
    this.db
      .update(downloads)
      .set({ status: 'completed', nodeId, finishedAt: now, updatedAt: now })
      .where(eq(downloads.id, id))
      .run();
  }

  markFailed(id: string, errorCode: string, errorMessage: string): void {
    const now = Date.now();
    this.db
      .update(downloads)
      .set({ status: 'failed', errorCode, errorMessage, finishedAt: now, updatedAt: now })
      .where(eq(downloads.id, id))
      .run();
  }

  /** Owner-scoped cancel: only valid from a non-terminal state (409 otherwise). */
  cancelIfNotTerminal(ownerId: string, id: string): DownloadRow {
    const row = this.getOwnedDownloadOrThrow404(ownerId, id);
    if (TERMINAL_STATUSES.includes(row.status)) throw conflict('Download already finished');
    const now = Date.now();
    this.db
      .update(downloads)
      .set({ status: 'canceled', finishedAt: now, updatedAt: now })
      .where(eq(downloads.id, id))
      .run();
    return { ...row, status: 'canceled', finishedAt: now, updatedAt: now };
  }

  /** Owner-scoped retry: only valid from `failed`/`canceled` (409 otherwise). Re-queues from scratch. */
  retryFromTerminal(ownerId: string, id: string): DownloadRow {
    const row = this.getOwnedDownloadOrThrow404(ownerId, id);
    if (row.status !== 'failed' && row.status !== 'canceled') {
      throw conflict('Only failed or canceled downloads can be retried');
    }
    const now = Date.now();
    const patch = {
      status: 'queued' as const,
      bytesDownloaded: 0,
      totalBytes: null,
      errorCode: null,
      errorMessage: null,
      attempt: row.attempt + 1,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    };
    this.db.update(downloads).set(patch).where(eq(downloads.id, id)).run();
    return { ...row, ...patch };
  }

  /** Delete the caller's terminal history (FR-017). Does not touch active jobs or files. */
  clearTerminalForOwner(ownerId: string): number {
    const rows = this.db
      .select({ id: downloads.id })
      .from(downloads)
      .where(and(eq(downloads.ownerId, ownerId), inArray(downloads.status, TERMINAL_STATUSES)))
      .all();
    if (rows.length === 0) return 0;
    this.db
      .delete(downloads)
      .where(and(eq(downloads.ownerId, ownerId), inArray(downloads.status, TERMINAL_STATUSES)))
      .run();
    return rows.length;
  }

  /** Delete one terminal history record (409 if still active). */
  deleteOneTerminal(ownerId: string, id: string): void {
    const row = this.getOwnedDownloadOrThrow404(ownerId, id);
    if (!TERMINAL_STATUSES.includes(row.status)) throw conflict('Cancel the download before deleting it');
    this.db.delete(downloads).where(eq(downloads.id, id)).run();
  }

  /**
   * Startup reconciliation (research.md §3): any row left `examining`/
   * `downloading` from a crash is re-queued (bytes reset, attempt+1) or, once
   * `maxAttempts` is exhausted, failed as retryable. The worker's own temp file
   * (if any) is an orphan the existing temp sweep collects — no partial file is
   * ever visible via the API either way.
   */
  reconcileInFlight(maxAttempts: number): { requeued: number; failed: number } {
    const inFlight = this.db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ['examining', 'downloading']))
      .all();
    let requeued = 0;
    let failed = 0;
    const now = Date.now();
    this.db.transaction((tx) => {
      for (const row of inFlight) {
        if (row.attempt + 1 < maxAttempts) {
          tx.update(downloads)
            .set({
              status: 'queued',
              bytesDownloaded: 0,
              attempt: row.attempt + 1,
              startedAt: null,
              updatedAt: now,
            })
            .where(eq(downloads.id, row.id))
            .run();
          requeued += 1;
        } else {
          tx.update(downloads)
            .set({
              status: 'failed',
              errorCode: 'INTERRUPTED',
              errorMessage: 'Interrupted by a server restart and could not be resumed automatically.',
              finishedAt: now,
              updatedAt: now,
            })
            .where(eq(downloads.id, row.id))
            .run();
          failed += 1;
        }
      }
    });
    return { requeued, failed };
  }
}
