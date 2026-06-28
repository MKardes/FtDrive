import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../db/client';
import { loginThrottle } from '../db/schema';

/**
 * Persisted progressive login throttle (research §7, FR-020). Keyed by BOTH
 * account (`user:<username>`) and source IP (`ip:<addr>`). Back-off escalates
 * with consecutive failures but never becomes a permanent lockout; a successful
 * login clears the account key. Persisted so a restart cannot reset an
 * attacker's back-off. Responses are uniform regardless of which key tripped.
 */

// No block until this many consecutive failures.
const FREE_ATTEMPTS = 3;
// Base back-off once blocking begins, doubling each further failure.
const BASE_BACKOFF_MS = 5_000;
// Cap on a single back-off window (no permanent lockout).
const MAX_BACKOFF_MS = 15 * 60 * 1000;
// Idle window after which the failure counter resets.
const WINDOW_RESET_MS = 60 * 60 * 1000;

export const accountKey = (username: string): string => `user:${username.toLowerCase()}`;
export const ipKey = (ip: string): string => `ip:${ip}`;

export class LoginThrottle {
  constructor(private readonly db: DrizzleDb) {}

  /** Returns the soonest time any of the keys is unblocked, or null if clear. */
  check(keys: string[]): { blocked: boolean; retryAfterMs: number } {
    const now = Date.now();
    let maxUntil = 0;
    for (const key of keys) {
      const row = this.db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).get();
      if (row?.blockedUntil && row.blockedUntil > now) {
        maxUntil = Math.max(maxUntil, row.blockedUntil);
      }
    }
    return maxUntil > now
      ? { blocked: true, retryAfterMs: maxUntil - now }
      : { blocked: false, retryAfterMs: 0 };
  }

  /** Record a failed attempt for every key and escalate the back-off. */
  registerFailure(keys: string[]): void {
    const now = Date.now();
    for (const key of keys) {
      const row = this.db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).get();
      let failedCount = 1;
      let firstFailedAt = now;
      if (row) {
        const windowExpired = now - row.firstFailedAt > WINDOW_RESET_MS && !this.isBlocked(row.blockedUntil, now);
        failedCount = windowExpired ? 1 : row.failedCount + 1;
        firstFailedAt = windowExpired ? now : row.firstFailedAt;
      }
      const blockedUntil =
        failedCount > FREE_ATTEMPTS
          ? now + Math.min(BASE_BACKOFF_MS * 2 ** (failedCount - FREE_ATTEMPTS - 1), MAX_BACKOFF_MS)
          : null;

      this.db
        .insert(loginThrottle)
        .values({ key, failedCount, firstFailedAt, blockedUntil })
        .onConflictDoUpdate({
          target: loginThrottle.key,
          set: { failedCount, firstFailedAt, blockedUntil },
        })
        .run();
    }
  }

  /** Clear a key (called for the account key on successful login). */
  clear(keys: string[]): void {
    for (const key of keys) {
      this.db.delete(loginThrottle).where(eq(loginThrottle.key, key)).run();
    }
  }

  private isBlocked(blockedUntil: number | null, now: number): boolean {
    return blockedUntil !== null && blockedUntil > now;
  }
}
