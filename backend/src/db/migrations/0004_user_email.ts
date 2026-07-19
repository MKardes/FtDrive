import type { Migration } from './index';

/**
 * Email addressing for direct shares (006-share-links amendment). Append-only,
 * data-preserving: adds a nullable `email` column to `users` — existing
 * accounts keep working with no email until the owner records one. Values are
 * stored trimmed+lowercased, so the partial unique index is case-insensitive
 * in effect.
 */
export const m0004_user_email: Migration = {
  id: '0004_user_email',
  statements: [
    `ALTER TABLE users ADD COLUMN email TEXT`,
    `CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL`,
  ],
};
