import { validationFailed } from './errors';

/** Opaque keyset cursor: (sort value, id) of the last row on the previous page. */
export interface Cursor {
  v: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Cursor).v === 'string' &&
      typeof (parsed as Cursor).id === 'string'
    ) {
      return parsed as Cursor;
    }
  } catch {
    // fall through
  }
  throw validationFailed([{ path: 'cursor', message: 'Invalid cursor' }]);
}

/** Given limit+1 fetched rows, return the page and the next cursor. */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null };
}

/** ILIKE pattern for "contains", with user-supplied wildcards escaped. */
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}
