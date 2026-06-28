import argon2 from 'argon2';
import { validationError } from '../lib/errors';

/** Argon2id password hashing (research §6). Memory-hard, slow one-way. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB (OWASP minimum)
  timeCost: 2,
  parallelism: 1,
};

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Enforce the minimum password policy at set-time (data-model.md). */
export function assertPasswordPolicy(plain: string): void {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw validationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/**
 * A precomputed dummy hash used to equalize timing when a username does not
 * exist, so login cannot enumerate accounts via response time (research §7).
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword('ftdrive-timing-equalization-placeholder');
  return dummyHash;
}
