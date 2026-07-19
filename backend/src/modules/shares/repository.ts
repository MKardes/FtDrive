import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, isNotNull, lt, ne } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client';
import { nodes, shares, users, type NodeRow, type ShareRow } from '../../db/schema';
import { notFound, validationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import type { NodeDto, Page } from '../nodes/repository';
import { NodeRepository, toNodeDto } from '../nodes/repository';

/**
 * Share-scoped data-access layer — the SECOND isolation choke point
 * (006-share-links, research.md §4). `NodeRepository` stays the owner-scoped
 * choke point; this class is the only code that reads nodes on behalf of a
 * share. Every access path resolves the SHARE ROW FIRST (by token, or by id +
 * authenticated recipient/owner) — the share pins `owner_id` and the shared
 * root — and every subsequent node read filters by that owner AND proves the
 * requested node sits inside the shared subtree. Any failure (missing, foreign,
 * revoked, expired, trashed, out-of-subtree) throws the SAME uniform 404.
 */

export interface ShareRecipientDto {
  id: string;
  username: string;
  email: string | null;
}

export interface ShareDto {
  id: string;
  nodeId: string;
  kind: 'link' | 'user';
  token?: string;
  recipient?: ShareRecipientDto;
  createdAt: number;
  expiresAt: number | null;
}

export interface ShareWithNodeDto extends ShareDto {
  node: { id: string; name: string; type: 'folder' | 'file' };
}

export interface SharedWithMeItemDto {
  shareId: string;
  createdAt: number;
  expiresAt: number | null;
  owner: { username: string };
  node: NodeDto;
}

/** An authorized share resolution: the grant plus its live shared root. */
export interface ShareContext {
  share: ShareRow;
  root: NodeRow;
}

export function toShareDto(row: ShareRow, recipient?: ShareRecipientDto): ShareDto {
  return {
    id: row.id,
    nodeId: row.nodeId,
    kind: row.kind,
    ...(row.kind === 'link' && row.token ? { token: row.token } : {}),
    ...(row.kind === 'user' && recipient ? { recipient } : {}),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** 256-bit unguessable capability token (research.md §3). */
function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export class SharesRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly nodes: NodeRepository,
  ) {}

  // --- Owner management (scoped by authenticated owner) --------------------

  /**
   * Create (or surface the existing) link share for an owned, live node.
   * Dedupe (FR-013): an active link is returned as-is; an expired leftover row
   * is replaced with a fresh token.
   */
  createLinkShare(ownerId: string, nodeId: string, expiresAt: number | null): ShareRow {
    this.nodes.getOwnedLiveNodeOrThrow404(ownerId, nodeId);

    const existing = this.db
      .select()
      .from(shares)
      .where(and(eq(shares.nodeId, nodeId), eq(shares.kind, 'link')))
      .get();
    if (existing) {
      if (!isExpired(existing)) return existing;
      this.db.delete(shares).where(eq(shares.id, existing.id)).run();
    }

    const row: ShareRow = {
      id: newId(),
      ownerId,
      nodeId,
      kind: 'link',
      token: newShareToken(),
      recipientId: null,
      createdAt: Date.now(),
      expiresAt,
    };
    this.db.insert(shares).values(row).run();
    return row;
  }

  /**
   * Grant read access on an owned, live node to named recipients (one row per
   * recipient, transactional). Recipients must be existing, active accounts
   * other than the caller. Existing active grants are surfaced, not duplicated
   * (FR-013); expired leftovers are replaced.
   */
  createUserShares(
    ownerId: string,
    nodeId: string,
    recipientIds: string[],
    expiresAt: number | null,
  ): ShareRow[] {
    this.nodes.getOwnedLiveNodeOrThrow404(ownerId, nodeId);

    const unique = [...new Set(recipientIds)];
    if (unique.length === 0) throw validationError('At least one recipient is required');
    if (unique.includes(ownerId)) throw validationError('You cannot share an item with yourself');

    for (const rid of unique) {
      const recipient = this.db.select().from(users).where(eq(users.id, rid)).get();
      if (!recipient || recipient.status !== 'active') {
        throw validationError('Unknown or inactive recipient');
      }
    }

    const now = Date.now();
    const out: ShareRow[] = [];
    this.db.transaction((tx) => {
      for (const rid of unique) {
        const existing = tx
          .select()
          .from(shares)
          .where(and(eq(shares.nodeId, nodeId), eq(shares.kind, 'user'), eq(shares.recipientId, rid)))
          .get();
        if (existing) {
          if (!isExpired(existing)) {
            out.push(existing);
            continue;
          }
          tx.delete(shares).where(eq(shares.id, existing.id)).run();
        }
        const row: ShareRow = {
          id: newId(),
          ownerId,
          nodeId,
          kind: 'user',
          token: null,
          recipientId: rid,
          createdAt: now,
          expiresAt,
        };
        tx.insert(shares).values(row).run();
        out.push(row);
      }
    });
    return out;
  }

  /** All of the owner's grants, newest first, with node + recipient info. */
  listByOwner(ownerId: string): ShareWithNodeDto[] {
    const rows = this.db
      .select({ share: shares, node: nodes, recipient: users })
      .from(shares)
      .innerJoin(nodes, eq(shares.nodeId, nodes.id))
      .leftJoin(users, eq(shares.recipientId, users.id))
      .where(eq(shares.ownerId, ownerId))
      .orderBy(desc(shares.createdAt), desc(shares.id))
      .all();
    return rows.map((r) => this.toShareWithNode(r.share, r.node, r.recipient));
  }

  /** The owner's grants on ONE owned node (uniform 404 for foreign/missing nodes). */
  listByNode(ownerId: string, nodeId: string): ShareWithNodeDto[] {
    this.nodes.getOwnedNodeOrThrow404(ownerId, nodeId);
    const rows = this.db
      .select({ share: shares, node: nodes, recipient: users })
      .from(shares)
      .innerJoin(nodes, eq(shares.nodeId, nodes.id))
      .leftJoin(users, eq(shares.recipientId, users.id))
      .where(and(eq(shares.ownerId, ownerId), eq(shares.nodeId, nodeId)))
      .orderBy(desc(shares.createdAt), desc(shares.id))
      .all();
    return rows.map((r) => this.toShareWithNode(r.share, r.node, r.recipient));
  }

  /** A grant owned by `ownerId`, or the uniform 404 (missing OR foreign). */
  getOwnedShareOrThrow404(ownerId: string, shareId: string): ShareRow {
    const row = this.db
      .select()
      .from(shares)
      .where(and(eq(shares.id, shareId), eq(shares.ownerId, ownerId)))
      .get();
    if (!row) throw notFound();
    return row;
  }

  /** Set/clear a grant's expiration (owner-scoped). */
  updateExpiry(ownerId: string, shareId: string, expiresAt: number | null): ShareRow {
    const row = this.getOwnedShareOrThrow404(ownerId, shareId);
    this.db.update(shares).set({ expiresAt }).where(eq(shares.id, row.id)).run();
    return { ...row, expiresAt };
  }

  /** Revoke = delete the row (research.md §2). Uniform 404 for missing/foreign. */
  deleteOwned(ownerId: string, shareId: string): void {
    const row = this.getOwnedShareOrThrow404(ownerId, shareId);
    this.db.delete(shares).where(eq(shares.id, row.id)).run();
  }

  // --- Share resolution (authorization for recipient/anonymous access) -----

  /** Resolve an open link by token → active share + live root, or uniform 404. */
  resolveActiveByTokenOrThrow404(token: string): ShareContext {
    if (!token) throw notFound();
    const share = this.db
      .select()
      .from(shares)
      .where(and(eq(shares.token, token), eq(shares.kind, 'link')))
      .get();
    return this.toActiveContextOrThrow404(share);
  }

  /** Resolve a direct share for its recipient → active share + live root, or uniform 404. */
  resolveActiveForRecipientOrThrow404(shareId: string, recipientId: string): ShareContext {
    const share = this.db
      .select()
      .from(shares)
      .where(and(eq(shares.id, shareId), eq(shares.kind, 'user'), eq(shares.recipientId, recipientId)))
      .get();
    return this.toActiveContextOrThrow404(share);
  }

  private toActiveContextOrThrow404(share: ShareRow | undefined): ShareContext {
    if (!share || isExpired(share)) throw notFound();
    // The share pins the owner; the root must be that owner's live node. A
    // trashed root (incl. via a trashed ancestor — trash marks whole subtrees)
    // suspends access (FR-010).
    const root = this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, share.nodeId), eq(nodes.ownerId, share.ownerId), isNull(nodes.trashedAt)))
      .get();
    if (!root) throw notFound();
    return { share, root };
  }

  /**
   * Prove a requested node sits inside the share's subtree. `nodeId` of
   * null/'root' means the shared root itself. The node must be live, owned by
   * the share's owner, and reach the shared root via its `parent_id` chain —
   * anything else is the uniform 404. Never trusts the client-supplied id.
   */
  resolveSubtreeNodeOrThrow404(ctx: ShareContext, nodeId: string | null | undefined): NodeRow {
    if (nodeId === null || nodeId === undefined || nodeId === 'root' || nodeId === ctx.root.id) {
      return ctx.root;
    }
    const row = this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.ownerId, ctx.share.ownerId), isNull(nodes.trashedAt)))
      .get();
    if (!row) throw notFound();

    // Walk up to the shared root; a live node cannot have a trashed ancestor
    // (trash/restore always act on whole subtrees), so id-chain membership is
    // the only property left to prove.
    let current: string | null = row.parentId;
    const seen = new Set<string>([row.id]);
    while (current) {
      if (current === ctx.root.id) return row;
      if (seen.has(current)) break; // defensive against a corrupt cycle
      seen.add(current);
      const parent: { parentId: string | null } | undefined = this.db
        .select({ parentId: nodes.parentId })
        .from(nodes)
        .where(and(eq(nodes.id, current), eq(nodes.ownerId, ctx.share.ownerId)))
        .get();
      current = parent?.parentId ?? null;
    }
    throw notFound();
  }

  /**
   * Keyset-paginated children of a folder inside the share's subtree. Reuses
   * the owner-scoped `NodeRepository.listChildren` with the owner id pinned
   * from the share row — the folder was already proven in-subtree.
   */
  listChildrenInShare(
    ctx: ShareContext,
    folder: NodeRow,
    opts: { cursor?: string; limit?: number },
  ): Page<NodeDto> {
    if (folder.type !== 'folder') throw notFound();
    return this.nodes.listChildren(ctx.share.ownerId, folder.id, opts);
  }

  /**
   * Share-facing DTO for a node: the shared root is presented with
   * `parentId: null` so the owner's private ancestry never leaks
   * (research.md §11); in-subtree children keep their real parent ids.
   */
  toSharedNodeDto(ctx: ShareContext, row: NodeRow): NodeDto {
    const dto = toNodeDto(row);
    if (row.id === ctx.root.id) return { ...dto, parentId: null };
    return dto;
  }

  // --- Recipient listing ----------------------------------------------------

  /** Active direct shares naming `userId`, newest first, trashed items omitted. */
  listSharedWith(userId: string): SharedWithMeItemDto[] {
    const now = Date.now();
    const rows = this.db
      .select({ share: shares, node: nodes, owner: users })
      .from(shares)
      .innerJoin(nodes, eq(shares.nodeId, nodes.id))
      .innerJoin(users, eq(shares.ownerId, users.id))
      .where(and(eq(shares.kind, 'user'), eq(shares.recipientId, userId), isNull(nodes.trashedAt)))
      .orderBy(desc(shares.createdAt), desc(shares.id))
      .all();
    return rows
      .filter((r) => r.share.expiresAt === null || r.share.expiresAt > now)
      .map((r) => ({
        shareId: r.share.id,
        createdAt: r.share.createdAt,
        expiresAt: r.share.expiresAt,
        owner: { username: r.owner.username },
        node: { ...toNodeDto(r.node), parentId: null },
      }));
  }

  // --- Maintenance ----------------------------------------------------------

  /** Hard-delete expired grants (hourly sweep; rows are already dead at resolution). */
  deleteExpired(now: number): number {
    const expired = this.db
      .select({ id: shares.id })
      .from(shares)
      .where(and(isNotNull(shares.expiresAt), lt(shares.expiresAt, now)))
      .all();
    if (expired.length === 0) return 0;
    this.db.transaction((tx) => {
      for (const r of expired) tx.delete(shares).where(eq(shares.id, r.id)).run();
    });
    return expired.length;
  }

  // --- Directory (recipient picker) ------------------------------------------

  /**
   * Active users other than the caller — `{id, username, email}` only
   * (research.md §8/§13). Email is the addressing identity the picker
   * resolves; accounts without one remain reachable by username.
   */
  listDirectory(callerId: string): ShareRecipientDto[] {
    return this.db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(and(eq(users.status, 'active'), ne(users.id, callerId)))
      .orderBy(users.username)
      .all();
  }

  private toShareWithNode(
    share: ShareRow,
    node: NodeRow,
    recipient: { id: string; username: string; email: string | null } | null,
  ): ShareWithNodeDto {
    // Re-pick the recipient fields explicitly: `recipient` arrives as a full
    // users row from the join, and spreading it would leak the password hash.
    return {
      ...toShareDto(
        share,
        recipient ? { id: recipient.id, username: recipient.username, email: recipient.email } : undefined,
      ),
      node: { id: node.id, name: node.name, type: node.type },
    };
  }
}

function isExpired(share: ShareRow): boolean {
  return share.expiresAt !== null && share.expiresAt <= Date.now();
}
