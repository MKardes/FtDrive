import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import type { DrizzleDb } from '../db/client';
import { sessions, users, type UserRow } from '../db/schema';

export interface AuthUser {
  id: string;
  username: string;
  role: 'owner' | 'user';
  status: 'active' | 'disabled';
}

export interface CreateSessionInput {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}

function toAuthUser(u: UserRow): AuthUser {
  return { id: u.id, username: u.username, role: u.role, status: u.status };
}

/**
 * Server-side session store (research §6). Sessions are random opaque ids,
 * referenced by a signed HttpOnly cookie. A session is valid only while
 * `revoked_at IS NULL AND expires_at > now` and its user is active.
 */
export class SessionService {
  constructor(
    private readonly db: DrizzleDb,
    private readonly ttlMs: number,
  ) {}

  create(input: CreateSessionInput): { id: string; expiresAt: number } {
    const id = randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + this.ttlMs;
    this.db
      .insert(sessions)
      .values({
        id,
        userId: input.userId,
        createdAt: now,
        expiresAt,
        revokedAt: null,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
      })
      .run();
    return { id, expiresAt };
  }

  /** Validate a session id; returns the active user + session, or null. */
  validate(sessionId: string): { user: AuthUser; sessionId: string } | null {
    const now = Date.now();
    const row = this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          eq(users.status, 'active'),
        ),
      )
      .get();
    if (!row) return null;
    return { user: toAuthUser(row.user), sessionId };
  }

  revoke(sessionId: string): void {
    this.db
      .update(sessions)
      .set({ revokedAt: Date.now() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .run();
  }

  revokeAllForUser(userId: string): void {
    this.db
      .update(sessions)
      .set({ revokedAt: Date.now() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .run();
  }

  revokeOthersForUser(userId: string, keepSessionId: string): void {
    this.db
      .update(sessions)
      .set({ revokedAt: Date.now() })
      .where(
        and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt)),
      )
      .run();
  }

  /** Remove expired sessions (housekeeping sweep). Revoked ones age out on expiry. */
  purgeExpired(): number {
    const res = this.db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
    return res.changes;
  }
}
