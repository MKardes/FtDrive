import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Drizzle schema (data-model.md). All ids are opaque ULIDs. */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    // Lowercased copy enabling a case-insensitive uniqueness constraint.
    usernameLower: text('username_lower').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['owner', 'user'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('users_username_lower_unique').on(t.usernameLower)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    // Isolation key (Principle II) — every node query is filtered by this.
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    type: text('type', { enum: ['folder', 'file'] }).notNull(),
    name: text('name').notNull(),
    size: integer('size'),
    mimeType: text('mime_type'),
    storagePath: text('storage_path'),
    thumbStatus: text('thumb_status', { enum: ['none', 'pending', 'ready', 'unsupported'] })
      .notNull()
      .default('none'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    trashedAt: integer('trashed_at'),
    trashedExpiresAt: integer('trashed_expires_at'),
    originalParentId: text('original_parent_id'),
  },
  (t) => [
    index('nodes_owner_parent_idx').on(t.ownerId, t.parentId),
    index('nodes_owner_name_idx').on(t.ownerId, t.name),
    index('nodes_trashed_at_idx').on(t.trashedAt),
    // No two LIVE siblings share a name; collisions resolved by keep-both (FR-013).
    uniqueIndex('nodes_owner_parent_name_live_unique')
      .on(t.ownerId, t.parentId, t.name)
      .where(sql`${t.trashedAt} IS NULL`),
  ],
);

export const loginThrottle = sqliteTable('login_throttle', {
  key: text('key').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  firstFailedAt: integer('first_failed_at').notNull(),
  blockedUntil: integer('blocked_until'),
});

// Download-from-web feature (002-url-video-download; data-model.md).
export const downloads = sqliteTable(
  'downloads',
  {
    id: text('id').primaryKey(),
    // Isolation key (Principle II) — every query is filtered by this.
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    destinationParentId: text('destination_parent_id'),
    selection: text('selection'),
    title: text('title'),
    status: text('status', {
      enum: ['queued', 'examining', 'downloading', 'completed', 'failed', 'canceled'],
    })
      .notNull()
      .default('queued'),
    bytesDownloaded: integer('bytes_downloaded').notNull().default(0),
    totalBytes: integer('total_bytes'),
    nodeId: text('node_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attempt: integer('attempt').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('downloads_owner_created_idx').on(t.ownerId, t.createdAt),
    index('downloads_owner_status_idx').on(t.ownerId, t.status),
    index('downloads_status_created_idx').on(t.status, t.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type NodeRow = typeof nodes.$inferSelect;
export type NewNodeRow = typeof nodes.$inferInsert;
export type LoginThrottleRow = typeof loginThrottle.$inferSelect;
export type DownloadRow = typeof downloads.$inferSelect;
export type NewDownloadRow = typeof downloads.$inferInsert;
