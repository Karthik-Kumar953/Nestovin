/**
 * CSV for admin exports. Values that a spreadsheet would treat as a formula
 * (=, +, -, @, tab, CR) are prefixed with a quote (CSV injection), every value
 * is quoted, and a UTF-8 BOM makes Excel read Indian names correctly.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Collects every page of a cursor-paginated list, up to a hard cap. */
export async function allPages<T>(fetch: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>, cap = 10_000): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    out.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && out.length < cap);
  return out.slice(0, cap);
}
