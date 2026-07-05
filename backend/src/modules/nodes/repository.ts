import { and, eq, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client';
import { nodes, type NodeRow } from '../../db/schema';
import { notFound, conflict } from '../../lib/errors';
import { newId } from '../../lib/ids';
import {
  clampLimit,
  decodeNodeCursor,
  encodeNodeCursor,
  nodeKeysetAfter,
  decodeTrashCursor,
  encodeTrashCursor,
  trashKeysetAfter,
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

  // --- Organize: rename / move (US3, T062) --------------------------------

  /**
   * True if `destId` is `nodeId` itself or a descendant of it. Used to reject a
   * move that would create a cycle (a folder into itself or its own subtree).
   */
  isSelfOrDescendant(ownerId: string, nodeId: string, destId: string): boolean {
    let current: string | null = destId;
    const seen = new Set<string>();
    while (current) {
      if (current === nodeId) return true;
      if (seen.has(current)) break; // defensive against a corrupt cycle
      seen.add(current);
      const row: { parentId: string | null } | undefined = this.db
        .select({ parentId: nodes.parentId })
        .from(nodes)
        .where(and(eq(nodes.id, current), eq(nodes.ownerId, ownerId)))
        .get();
      current = row?.parentId ?? null;
    }
    return false;
  }

  /**
   * Rename and/or move a live owned node. Destination (when given) must be an
   * owned, live folder; moving a folder into itself/a descendant is a cycle and
   * throws 409. Name collisions at the target keep both via suffixing (FR-013).
   */
  renameMove(
    ownerId: string,
    id: string,
    changes: { name?: string; parentId?: string | null },
  ): NodeRow {
    const node = this.getOwnedLiveNodeOrThrow404(ownerId, id);
    // The implicit root (parent_id IS NULL) cannot be renamed or moved.
    if (node.parentId === null) throw notFound();

    let targetParentId = node.parentId;
    if (changes.parentId !== undefined) {
      const dest = this.resolveOwnedFolderOrThrow404(ownerId, changes.parentId);
      if (node.type === 'folder' && this.isSelfOrDescendant(ownerId, node.id, dest.id)) {
        throw conflict('Cannot move a folder into itself or its descendant');
      }
      targetParentId = dest.id;
    }

    const desiredName = changes.name !== undefined ? changes.name : node.name;
    const finalName = this.resolveAvailableName(ownerId, targetParentId, desiredName, node.id);

    const now = Date.now();
    this.db
      .update(nodes)
      .set({ name: finalName, parentId: targetParentId, updatedAt: now })
      .where(and(eq(nodes.id, id), eq(nodes.ownerId, ownerId)))
      .run();
    return { ...node, name: finalName, parentId: targetParentId, updatedAt: now };
  }

  // --- Trash: delete / list / restore / purge (US3, T063–T065) ------------

  /** Collect a node and ALL its descendants (any trashed state), root-first. */
  private collectSubtreeRows(ownerId: string, rootId: string): NodeRow[] {
    const all = this.db.select().from(nodes).where(eq(nodes.ownerId, ownerId)).all();
    const byParent = new Map<string | null, NodeRow[]>();
    let root: NodeRow | undefined;
    for (const r of all) {
      if (r.id === rootId) root = r;
      const list = byParent.get(r.parentId);
      if (list) list.push(r);
      else byParent.set(r.parentId, [r]);
    }
    if (!root) return [];
    const out: NodeRow[] = [];
    const stack: NodeRow[] = [root];
    while (stack.length > 0) {
      const n = stack.pop() as NodeRow;
      out.push(n);
      const kids = byParent.get(n.id);
      if (kids) for (const k of kids) stack.push(k);
    }
    return out;
  }

  /**
   * Move a live owned node (and its whole subtree) to trash (FR-007). Only the
   * deleted node records `original_parent_id` (the restore target); descendants
   * are marked trashed but restore together with their parent. `expiresAt` is
   * the retention deadline (now + TRASH_RETENTION_DAYS).
   */
  trashSubtree(ownerId: string, id: string, expiresAt: number): void {
    const node = this.getOwnedLiveNodeOrThrow404(ownerId, id);
    if (node.parentId === null) throw notFound(); // never trash the root
    const subtree = this.collectSubtreeRows(ownerId, id).filter((r) => r.trashedAt === null);
    const now = Date.now();
    this.db.transaction((tx) => {
      for (const r of subtree) {
        tx.update(nodes)
          .set({
            trashedAt: now,
            trashedExpiresAt: expiresAt,
            originalParentId: r.id === id ? r.parentId : null,
            updatedAt: now,
          })
          .where(eq(nodes.id, r.id))
          .run();
      }
    });
  }

  /**
   * Trash listing (data-model "Trash view"): only the explicitly-deleted roots
   * (`original_parent_id` set), newest first, keyset-paginated.
   */
  listTrash(ownerId: string, opts: { cursor?: string; limit?: number }): Page<TrashItemDto> {
    const limit = clampLimit(opts.limit);
    const cursor = decodeTrashCursor(opts.cursor);
    const conditions = [
      eq(nodes.ownerId, ownerId),
      isNotNull(nodes.trashedAt),
      isNotNull(nodes.originalParentId),
    ];
    if (cursor) conditions.push(trashKeysetAfter(cursor));

    let rows = this.db
      .select()
      .from(nodes)
      .where(and(...conditions))
      .orderBy(sql`${nodes.trashedAt} DESC`, sql`${nodes.id} ASC`)
      .limit(limit + 1)
      .all();

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      if (last && last.trashedAt !== null) {
        nextCursor = encodeTrashCursor({ trashedAt: last.trashedAt, id: last.id });
      }
      rows = rows.slice(0, limit);
    }
    return { items: rows.map(toTrashItemDto), nextCursor };
  }

  /** A trashed restore-root owned by `ownerId`, or uniform 404. */
  private getTrashRootOrThrow404(ownerId: string, id: string): NodeRow {
    const row = this.getOwnedNode(ownerId, id);
    if (!row || row.trashedAt === null || row.originalParentId === null) throw notFound();
    return row;
  }

  /**
   * Restore a trashed subtree to its original location (or root if that parent
   * is gone), re-resolving a name collision at the target via keep-both (FR-007).
   */
  restoreSubtree(ownerId: string, id: string): NodeRow {
    const root = this.getTrashRootOrThrow404(ownerId, id);

    // Target = original parent if it is still a live owned folder, else root.
    const original = root.originalParentId ? this.getOwnedNode(ownerId, root.originalParentId) : undefined;
    const targetId =
      original && original.trashedAt === null && original.type === 'folder'
        ? original.id
        : this.ensureRootNode(ownerId).id;

    const finalName = this.resolveAvailableName(ownerId, targetId, root.name, root.id);
    const subtree = this.collectSubtreeRows(ownerId, id).filter((r) => r.trashedAt !== null);
    const now = Date.now();
    this.db.transaction((tx) => {
      for (const r of subtree) {
        if (r.id === id) {
          tx.update(nodes)
            .set({
              trashedAt: null,
              trashedExpiresAt: null,
              originalParentId: null,
              parentId: targetId,
              name: finalName,
              updatedAt: now,
            })
            .where(eq(nodes.id, r.id))
            .run();
        } else {
          tx.update(nodes)
            .set({ trashedAt: null, trashedExpiresAt: null, originalParentId: null, updatedAt: now })
            .where(eq(nodes.id, r.id))
            .run();
        }
      }
    });
    return { ...root, trashedAt: null, trashedExpiresAt: null, originalParentId: null, parentId: targetId, name: finalName, updatedAt: now };
  }

  /**
   * Permanently remove a trashed subtree's DB rows (FR-008). Returns the removed
   * rows so the caller can delete the corresponding blobs + cached thumbnails.
   */
  purgeSubtree(ownerId: string, id: string): NodeRow[] {
    const root = this.getTrashRootOrThrow404(ownerId, id);
    const subtree = this.collectSubtreeRows(ownerId, root.id);
    this.db.transaction((tx) => {
      for (const r of subtree) tx.delete(nodes).where(eq(nodes.id, r.id)).run();
    });
    return subtree;
  }

  /** Permanently remove ALL of a user's trashed rows; returns them for blob cleanup. */
  emptyTrash(ownerId: string): NodeRow[] {
    const trashed = this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.ownerId, ownerId), isNotNull(nodes.trashedAt)))
      .all();
    this.db.transaction((tx) => {
      for (const r of trashed) tx.delete(nodes).where(eq(nodes.id, r.id)).run();
    });
    return trashed;
  }

  // --- Retention sweep (system job, US3 T065) -----------------------------

  /** Sum of `size` over the owner's live file nodes — the per-user storage quota basis (FR-014). */
  sumLiveFileSizes(ownerId: string): number {
    const row = this.db
      .select({ total: sql<number>`COALESCE(SUM(${nodes.size}), 0)` })
      .from(nodes)
      .where(and(eq(nodes.ownerId, ownerId), eq(nodes.type, 'file'), isNull(nodes.trashedAt)))
      .get();
    return row?.total ?? 0;
  }

  /** All trashed nodes (any owner) past their retention deadline. */
  collectExpiredTrash(now: number): NodeRow[] {
    return this.db
      .select()
      .from(nodes)
      .where(and(isNotNull(nodes.trashedAt), lt(nodes.trashedExpiresAt, now)))
      .all();
  }

  /** Delete nodes by id (system job; not owner-scoped). */
  deleteByIds(ids: string[]): void {
    if (ids.length === 0) return;
    this.db.transaction((tx) => {
      for (const id of ids) tx.delete(nodes).where(eq(nodes.id, id)).run();
    });
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
