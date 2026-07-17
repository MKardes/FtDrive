import { asc, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client';
import { users, type UserRow } from '../../db/schema';
import { newId } from '../../lib/ids';
import { conflict, validationError } from '../../lib/errors';
import { assertPasswordPolicy, hashPassword } from '../../auth/password';
import { isUniqueViolation, NodeRepository } from '../nodes/repository';
import type { Storage } from '../../storage/index';

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  role: 'owner' | 'user';
  status: 'active' | 'disabled';
}

export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, email: u.email, role: u.role, status: u.status };
}

const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

export function assertUsernamePolicy(username: string): void {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw validationError('Username must be 3–64 chars of letters, digits, dot, underscore, or hyphen');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase, and validate shape. Emails are stored normalized (006). */
export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 254) {
    throw validationError('That doesn’t look like a valid email address');
  }
  return value;
}

/**
 * User lifecycle (data-model.md). Shared by the owner-bootstrap CLI and the
 * owner-only admin routes. Creating a user provisions their root node + on-disk
 * isolated root; removing a user cascades nodes + sessions and deletes the root.
 */
export class UserService {
  private readonly nodes: NodeRepository;

  constructor(
    private readonly db: DrizzleDb,
    private readonly storage: Storage,
  ) {
    this.nodes = new NodeRepository(db);
  }

  getByUsername(username: string): UserRow | undefined {
    return this.db
      .select()
      .from(users)
      .where(eq(users.usernameLower, username.toLowerCase()))
      .get();
  }

  getById(id: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  list(): UserRow[] {
    return this.db.select().from(users).orderBy(asc(users.createdAt)).all();
  }

  async createUser(input: {
    username: string;
    password: string;
    role?: 'owner' | 'user';
    email?: string | null;
  }): Promise<UserRow> {
    assertUsernamePolicy(input.username);
    assertPasswordPolicy(input.password);
    const email = input.email ? normalizeEmail(input.email) : null;
    if (email) this.assertEmailAvailable(email);
    const passwordHash = await hashPassword(input.password);
    const now = Date.now();
    const row: UserRow = {
      id: newId(),
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      email,
      passwordHash,
      role: input.role ?? 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    try {
      this.db.insert(users).values(row).run();
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Username or email taken');
      throw err;
    }
    this.nodes.ensureRootNode(row.id);
    await this.storage.ensureUserDirs(row.id);
    return row;
  }

  /** Set or clear a user's email (owner admin). Stored normalized; must be unused. */
  setEmail(userId: string, email: string | null): UserRow {
    const normalized = email === null ? null : normalizeEmail(email);
    if (normalized) this.assertEmailAvailable(normalized, userId);
    try {
      this.db
        .update(users)
        .set({ email: normalized, updatedAt: Date.now() })
        .where(eq(users.id, userId))
        .run();
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Email already in use');
      throw err;
    }
    const row = this.getById(userId);
    if (!row) throw validationError('Unknown user');
    return row;
  }

  private assertEmailAvailable(email: string, excludeUserId?: string): void {
    const existing = this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (existing && existing.id !== excludeUserId) throw conflict('Email already in use');
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    assertPasswordPolicy(newPassword);
    const passwordHash = await hashPassword(newPassword);
    this.db
      .update(users)
      .set({ passwordHash, updatedAt: Date.now() })
      .where(eq(users.id, userId))
      .run();
  }

  /** Remove a user: cascade nodes + sessions (DB), then delete the on-disk root. */
  async deleteUser(userId: string): Promise<void> {
    this.db.delete(users).where(eq(users.id, userId)).run();
    await this.storage.removeUserRoot(userId);
  }

  ownerExists(): boolean {
    return !!this.db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).get();
  }
}
