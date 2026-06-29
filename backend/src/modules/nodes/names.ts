import { validationError } from '../../lib/errors';

/**
 * Node-name policy (data-model.md): non-empty, ≤255 chars, no path separators or
 * control characters, and not a `.`/`..` traversal token. Display names are
 * user-facing; the on-disk blob path is always opaque (see storage), so names
 * never influence the filesystem location.
 */
export const MAX_NAME_LENGTH = 255;

/** True if `name` contains a path separator or any ASCII control character. */
function hasForbiddenChar(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true; // control chars
    if (name[i] === '/' || name[i] === '\\') return true; // path separators
  }
  return false;
}

/** Validate + normalize a user-typed name (folder create, rename). Throws 400. */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') throw validationError('Name is required');
  const name = raw.trim();
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH ||
    name === '.' ||
    name === '..' ||
    hasForbiddenChar(name)
  ) {
    throw validationError('Invalid name');
  }
  return name;
}

/**
 * Coerce an uploaded file's client-supplied filename into a safe display name.
 * Unlike {@link normalizeName} this never throws — phones send odd names — it
 * strips any path and control characters and falls back to a generic name.
 */
export function sanitizeUploadName(raw: string | undefined | null): string {
  const base = (raw ?? '').split(/[/\\]/).pop() ?? '';
  let cleaned = '';
  for (let i = 0; i < base.length; i += 1) {
    const c = base.charCodeAt(i);
    if (c >= 0x20 && c !== 0x7f) cleaned += base[i];
  }
  cleaned = cleaned.trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..' ? cleaned : 'file';
}
