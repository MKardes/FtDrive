import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client';
import { nodes, type NodeRow } from '../../db/schema';
import { notFound, conflict } from '../../lib/errors';
import { newId } from '../../lib/ids';
import {
  clampLimit,
  decodeNodeCursor,
  encodeNodeCursor,
  nodeKeysetAfter,
} from '../../lib/pagination';

/**
 * Owner-scoped node data-access layer — the per-user ISOLATION CHOKE POINT
 * (Principle II). EVERY query here is filtered by `owner_id`, and
 * {@link getOwnedNodeOrThrow404} re-checks ownership before any caller can act
 * on a node. A request for a non-owned OR non-existent node yields the SAME
 * 404, disclosing nothing.
 */

export interface NodeDto {
  id: string;
  parentId: string | null;
  type: 'folder' | 'file';
  name: string;
  size: number | null;
  mimeType: string | null;
  thumbStatus: 'none' | 'pending' | 'ready' | 'unsupported';
  createdAt: number;
  updatedAt: number;
}

export interface TrashItemDto extends NodeDto {
  trashedAt: number;
  trashedExpiresAt: number | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function toNodeDto(row: NodeRow): NodeDto {
  return {
    id: row.id,
    // Present the user's root as parentId = null to the client.
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    thumbStatus: row.thumbStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTrashItemDto(row: NodeRow): TrashItemDto {
  return {
    ...toNodeDto(row),
    trashedAt: row.trashedAt ?? 0,
    trashedExpiresAt: row.trashedExpiresAt,
  };
}

export class NodeRepository {
  constructor(private readonly db: DrizzleDb) {}

  /** The user's implicit root folder (parent_id IS NULL). */
  getRootNode(ownerId: string): NodeRow | undefined {
    return this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.ownerId, ownerId), isNull(nodes.parentId)))
      .get();
  }

  /** Create the user's root folder if absent (called at user creation). */
  ensureRootNode(ownerId: string): NodeRow {
    const existing = this.getRootNode(ownerId);
    if (existing) return existing;
    const now = Date.now();
    const row: NodeRow = {
      id: newId(),
      ownerId,
      parentId: null,
      type: 'folder',
      name: '',
      size: null,
      mimeType: null,
      storagePath: null,
      thumbStatus: 'none',
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
      trashedExpiresAt: null,
      originalParentId: null,
    };
    this.db.insert(nodes).values(row).run();
    return row;
  }

  /** Fetch a node owned by `ownerId`, or undefined (missing OR non-owned). */
  getOwnedNode(ownerId: string, id: string): NodeRow | undefined {
    return this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, id), eq(nodes.ownerId, ownerId)))
      .get();
  }

  /** Fetch a node owned by `ownerId`, throwing a uniform 404 otherwise. */
  getOwnedNodeOrThrow404(ownerId: string, id: string): NodeRow {
    const row = this.getOwnedNode(ownerId, id);
    if (!row) throw notFound();
    return row;
  }

  /** Fetch a LIVE (non-trashed) owned node, or uniform 404. */
  getOwnedLiveNodeOrThrow404(ownerId: string, id: string): NodeRow {
    const row = this.getOwnedNode(ownerId, id);
    if (!row || row.trashedAt !== null) throw notFound();
    return row;
  }

  /**
   * Resolve a folder for listing/destination. `idOrRoot === 'root'` (or null)
   * resolves to the user's root. The target must be an owned, live folder.
   */
  resolveOwnedFolderOrThrow404(ownerId: string, idOrRoot: string | null): NodeRow {
    if (idOrRoot === null || idOrRoot === 'root') {
      return this.ensureRootNode(ownerId);
    }
    const row = this.getOwnedNode(ownerId, idOrRoot);
    if (!row || row.trashedAt !== null || row.type !== 'folder') throw notFound();
    return row;
  }

  /** Keyset-paginated children of a folder (live only). */
  listChildren(ownerId: string, parentId: string, opts: { cursor?: string; limit?: number }): Page<NodeDto> {
    const limit = clampLimit(opts.limit);
    const cursor = decodeNodeCursor(opts.cursor);
    const conditions = [eq(nodes.ownerId, ownerId), eq(nodes.parentId, parentId), isNull(nodes.trashedAt)];
    if (cursor) conditions.push(nodeKeysetAfter(cursor));

    const rows = this.db
      .select()
      .from(nodes)
      .where(and(...conditions))
      .orderBy(sql`${nodes.type} DESC`, sql`${nodes.name} ASC`, sql`${nodes.id} ASC`)
      .limit(limit + 1)
      .all();

    return this.toPage(rows, limit);
  }

  /** Owner-scoped, case-insensitive substring name search (FR-021). */
  search(ownerId: string, query: string, opts: { cursor?: string; limit?: number }): Page<NodeDto> {
    const limit = clampLimit(opts.limit);
    const cursor = decodeNodeCursor(opts.cursor);
    const pattern = `%${escapeLike(query.toLowerCase())}%`;
    const conditions = [
      eq(nodes.ownerId, ownerId),
      isNull(nodes.trashedAt),
      sql`lower(${nodes.name}) LIKE ${pattern} ESCAPE '\\'`,
    ];
    if (cursor) conditions.push(nodeKeysetAfter(cursor));

    const rows = this.db
      .select()
      .from(nodes)
      .where(and(...conditions))
      .orderBy(sql`${nodes.type} DESC`, sql`${nodes.name} ASC`, sql`${nodes.id} ASC`)
      .limit(limit + 1)
      .all();

    return this.toPage(rows, limit);
  }

  /** True if a live sibling with `name` exists under `parentId` (excluding `excludeId`). */
  liveSiblingExists(ownerId: string, parentId: string, name: string, excludeId?: string): boolean {
    const row = this.db
      .select({ id: nodes.id })
      .from(nodes)
      .where(
        and(
          eq(nodes.ownerId, ownerId),
          eq(nodes.parentId, parentId),
          eq(nodes.name, name),
          isNull(nodes.trashedAt),
        ),
      )
      .all();
    return row.some((r) => r.id !== excludeId);
  }

  /**
   * Resolve a non-colliding name under `parentId` using "keep both" suffixing
   * (FR-013): "photo.jpg" → "photo (2).jpg", "report" → "report (2)".
   */
  resolveAvailableName(ownerId: string, parentId: string, desired: string, excludeId?: string): string {
    if (!this.liveSiblingExists(ownerId, parentId, desired, excludeId)) return desired;
    const { base, ext } = splitNameExt(desired);
    for (let n = 2; n < 10_000; n += 1) {
      const candidate = `${base} (${n})${ext}`;
      if (!this.liveSiblingExists(ownerId, parentId, candidate, excludeId)) return candidate;
    }
    // Extremely unlikely; fall back to a unique suffix.
    return `${base} (${newId()})${ext}`;
  }

  /** Update a node's cached thumbnail status (owner-scoped). */
  setThumbStatus(ownerId: string, id: string, status: NodeRow['thumbStatus']): void {
    this.db
      .update(nodes)
      .set({ thumbStatus: status })
      .where(and(eq(nodes.id, id), eq(nodes.ownerId, ownerId)))
      .run();
  }

  /** Insert a file node (used by upload). Caller resolves the name first. */
  insertFileNode(input: {
    ownerId: string;
    parentId: string;
    name: string;
    size: number;
    mimeType: string | null;
    storagePath: string;
    thumbStatus: NodeRow['thumbStatus'];
  }): NodeRow {
    const now = Date.now();
    const row: NodeRow = {
      id: newId(),
      ownerId: input.ownerId,
      parentId: input.parentId,
      type: 'file',
      name: input.name,
      size: input.size,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      thumbStatus: input.thumbStatus,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
      trashedExpiresAt: null,
      originalParentId: null,
    };
    try {
      this.db.insert(nodes).values(row).run();
    } catch (err) {
      // Lost a race on the partial-unique index.
      if (isUniqueViolation(err)) throw conflict('Name already exists');
      throw err;
    }
    return row;
  }

  /** Insert a folder node. Caller resolves the name first. */
  insertFolderNode(input: { ownerId: string; parentId: string; name: string }): NodeRow {
    const now = Date.now();
    const row: NodeRow = {
      id: newId(),
      ownerId: input.ownerId,
      parentId: input.parentId,
      type: 'folder',
      name: input.name,
      size: null,
      mimeType: null,
      storagePath: null,
      thumbStatus: 'none',
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
      trashedExpiresAt: null,
      originalParentId: null,
    };
    try {
      this.db.insert(nodes).values(row).run();
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Name already exists');
      throw err;
    }
    return row;
  }

  private toPage(rows: NodeRow[], limit: number): Page<NodeDto> {
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      if (last) nextCursor = encodeNodeCursor(last);
      rows = rows.slice(0, limit);
    }
    return { items: rows.map(toNodeDto), nextCursor };
  }
}

function splitNameExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return { base: name.slice(0, dot), ext: name.slice(dot) };
  }
  return { base: name, ext: '' };
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}
