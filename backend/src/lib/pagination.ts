import { and, or, eq, gt, lt, type SQL } from 'drizzle-orm';
import { nodes } from '../db/schema';

/**
 * Keyset (cursor) pagination — O(limit) regardless of folder size (research §12).
 * Node listings/search order by (type DESC, name ASC, id ASC); trash orders by
 * (trashedAt DESC, id ASC). Cursors are opaque base64url JSON and reveal nothing.
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}
function decode<T>(raw: string | undefined | null, guard: (o: unknown) => o is T): T | null {
  if (!raw) return null;
  try {
    const obj: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return guard(obj) ? obj : null;
  } catch {
    return null;
  }
}

// --- Node listing / search cursor: (type DESC, name ASC, id ASC) ---

export interface NodeCursor {
  t: string;
  n: string;
  i: string;
}

function isNodeCursor(o: unknown): o is NodeCursor {
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof (o as NodeCursor).t === 'string' &&
    typeof (o as NodeCursor).n === 'string' &&
    typeof (o as NodeCursor).i === 'string'
  );
}

export const encodeNodeCursor = (row: { type: string; name: string; id: string }): string =>
  encode({ t: row.type, n: row.name, i: row.id });

export const decodeNodeCursor = (raw: string | undefined | null): NodeCursor | null =>
  decode(raw, isNodeCursor);

/** WHERE condition selecting rows strictly after the cursor under the node ordering. */
export function nodeKeysetAfter(c: NodeCursor): SQL {
  const t = c.t as 'folder' | 'file';
  return or(
    lt(nodes.type, t),
    and(eq(nodes.type, t), gt(nodes.name, c.n)),
    and(eq(nodes.type, t), eq(nodes.name, c.n), gt(nodes.id, c.i)),
  ) as SQL;
}

// --- Trash cursor: (trashedAt DESC, id ASC) ---

export interface TrashCursor {
  ta: number;
  i: string;
}

function isTrashCursor(o: unknown): o is TrashCursor {
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof (o as TrashCursor).ta === 'number' &&
    typeof (o as TrashCursor).i === 'string'
  );
}

export const encodeTrashCursor = (row: { trashedAt: number; id: string }): string =>
  encode({ ta: row.trashedAt, i: row.id });

export const decodeTrashCursor = (raw: string | undefined | null): TrashCursor | null =>
  decode(raw, isTrashCursor);

export function trashKeysetAfter(c: TrashCursor): SQL {
  return or(
    lt(nodes.trashedAt, c.ta),
    and(eq(nodes.trashedAt, c.ta), gt(nodes.id, c.i)),
  ) as SQL;
}
