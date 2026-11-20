import { readSheet } from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { IMPORT_COLUMNS, IMPORT_LIMITS, IMPORT_OCCUPANCY_VALUES } from '@nestovin/contracts';

/*
 * Workbook parsing and row validation for community migration (ADR-011).
 * Pure functions: no database access, so they are unit-testable.
 */

export interface ParsedWorkbook {
  fileErrors: string[];
  rows: { rowNumber: number; raw: Record<string, unknown> }[];
}

export interface NormalizedRow {
  tower: string;
  floor: number | null;
  flatNumber: string;
  bhkType: string | null;
  areaSqft: number | null;
  categoryRef: string;
  occupancy: 'OWNER' | 'TENANT' | 'VACANT' | null;
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Reads the first sheet; checks the header row exactly matches the template. */
export async function parseWorkbook(buf: Buffer): Promise<ParsedWorkbook> {
  if (buf.length === 0) return { fileErrors: ['The file is empty'], rows: [] };
  if (buf.length > IMPORT_LIMITS.maxBytes) return { fileErrors: ['The file is larger than 5 MB'], rows: [] };
  if (!buf.subarray(0, 4).equals(ZIP_MAGIC)) {
    return { fileErrors: ['This is not an .xlsx workbook. Use the downloaded template and save as Excel Workbook (.xlsx).'], rows: [] };
  }

  let sheet: unknown[][];
  try {
    sheet = (await readSheet(buf)) as unknown[][];
  } catch {
    return { fileErrors: ['The workbook could not be read. Re-save it as .xlsx and try again.'], rows: [] };
  }

  const [header, ...body] = sheet;
  const headerCells = (header ?? []).map((c) => String(c ?? '').trim());
  const expected = [...IMPORT_COLUMNS];
  const headerOk =
    headerCells.length >= expected.length &&
    expected.every((col, i) => headerCells[i]?.toLowerCase() === col.toLowerCase());
  if (!headerOk) {
    return {
      fileErrors: [`The first row must be exactly: ${expected.join(' | ')}. Download the template and keep its header row.`],
      rows: [],
    };
  }

  const rows: ParsedWorkbook['rows'] = [];
  body.forEach((cells, i) => {
    const values = expected.map((_, c) => cells?.[c]);
    if (values.every((v) => v === null || v === undefined || String(v).trim() === '')) return; // blank row
    const raw: Record<string, unknown> = {};
    expected.forEach((col, c) => {
      const v = values[c];
      raw[col] = v instanceof Date ? v.toISOString() : (v ?? null);
    });
    rows.push({ rowNumber: i + 2, raw });
  });

  if (rows.length === 0) return { fileErrors: ['The workbook has no data rows'], rows: [] };
  if (rows.length > IMPORT_LIMITS.maxRows) {
    return { fileErrors: [`The workbook has ${rows.length} rows; the limit is ${IMPORT_LIMITS.maxRows}. Split it into smaller files.`], rows: [] };
  }
  return { fileErrors: [], rows };
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Field-level validation of one row (no database lookups). */
export function normalizeRow(raw: Record<string, unknown>): { value?: NormalizedRow; errors: string[] } {
  const errors: string[] = [];
  const tower = text(raw['Tower']);
  const flatNumber = text(raw['Flat number']);
  const floorText = text(raw['Floor']);
  const bhk = text(raw['BHK type']);
  const areaText = text(raw['Area (sq ft)']);
  const categoryRef = text(raw['Residence category']);
  const occText = text(raw['Occupancy']);

  if (!tower) errors.push('Tower is required');
  else if (tower.length > 60) errors.push('Tower name is longer than 60 characters');
  if (!flatNumber) errors.push('Flat number is required');
  else if (flatNumber.length > 20) errors.push('Flat number is longer than 20 characters');

  let floor: number | null = null;
  if (floorText) {
    const n = Number(floorText);
    if (!Number.isInteger(n) || n < -5 || n > 200) errors.push('Floor must be a whole number between -5 and 200');
    else floor = n;
  }
  if (bhk.length > 40) errors.push('BHK type is longer than 40 characters');

  let areaSqft: number | null = null;
  if (areaText) {
    const n = Number(areaText.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) errors.push('Area must be a positive number of square feet');
    else areaSqft = Math.round(n * 100) / 100;
  }

  if (!categoryRef) errors.push('Residence category is required');

  let occupancy: NormalizedRow['occupancy'] = null;
  if (occText) {
    const match = IMPORT_OCCUPANCY_VALUES.find((o) => o.toLowerCase() === occText.toLowerCase());
    if (!match) errors.push(`Occupancy must be one of: ${IMPORT_OCCUPANCY_VALUES.join(', ')}`);
    else occupancy = match.toUpperCase() as NormalizedRow['occupancy'];
  }

  if (errors.length) return { errors };
  return {
    errors,
    value: { tower, floor, flatNumber, bhkType: bhk || null, areaSqft, categoryRef, occupancy },
  };
}

/** Template workbook: header row + an instructions sheet listing this community's categories. */
export async function buildTemplate(communityName: string, categories: { code: string; label: string }[]): Promise<Buffer> {
  const headerStyle = { fontWeight: 'bold' as const, backgroundColor: '#E5F3F1' };
  const data = [IMPORT_COLUMNS.map((c) => ({ value: c, ...headerStyle }))];
  const instructions = [
    [{ value: `Community migration template: ${communityName}`, fontWeight: 'bold' as const }],
    [{ value: 'Fill the "Flats" sheet, one row per flat. Keep the header row exactly as it is.' }],
    [{ value: 'Do not add residents’ names or phone numbers: residents register themselves in the app.' }],
    [{ value: '' }],
    [{ value: 'Column', fontWeight: 'bold' as const }, { value: 'Rules', fontWeight: 'bold' as const }],
    [{ value: 'Tower' }, { value: 'Required. Tower / block / building name, e.g. "A" or "Tower 1".' }],
    [{ value: 'Floor' }, { value: 'Optional whole number (-5 to 200).' }],
    [{ value: 'Flat number' }, { value: 'Required. Unique within the tower, e.g. "101".' }],
    [{ value: 'BHK type' }, { value: 'Optional text, e.g. "2 BHK".' }],
    [{ value: 'Area (sq ft)' }, { value: 'Optional positive number.' }],
    [{ value: 'Residence category' }, { value: 'Required. Must be one of the codes or labels below.' }],
    [{ value: 'Occupancy' }, { value: `Optional: ${IMPORT_OCCUPANCY_VALUES.join(', ')}.` }],
    [{ value: '' }],
    [{ value: 'Residence categories for this community', fontWeight: 'bold' as const }],
    [{ value: 'Code', fontWeight: 'bold' as const }, { value: 'Label', fontWeight: 'bold' as const }],
    ...(categories.length
      ? categories.map((c) => [{ value: c.code }, { value: c.label }])
      : [[{ value: '(none yet: define categories in Community Setup before importing)' }]]),
  ];
  return writeXlsxFile([
    { data, sheet: 'Flats', columns: IMPORT_COLUMNS.map(() => ({ width: 20 })) },
    { data: instructions, sheet: 'Instructions', columns: [{ width: 28 }, { width: 80 }] },
  ]).toBuffer();
}
