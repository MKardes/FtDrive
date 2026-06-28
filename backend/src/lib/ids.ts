import { ulid } from 'ulidx';

/** Generate an opaque, sortable ULID. Used for all entity ids (data-model.md). */
export function newId(): string {
  return ulid();
}
