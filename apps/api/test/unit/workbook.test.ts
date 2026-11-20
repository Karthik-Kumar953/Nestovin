import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { IMPORT_COLUMNS } from '@nestovin/contracts';
import { buildTemplate, normalizeRow, parseWorkbook } from '../../src/modules/migration/workbook';

async function workbook(rows: (string | number | null)[][], header: readonly string[] = IMPORT_COLUMNS) {
  const data = [header.map((value) => ({ value })), ...rows.map((r) => r.map((value) => (value === null ? null : { value })))];
  return writeXlsxFile(data as never).toBuffer();
}

describe('parseWorkbook', () => {
  it('reads data rows with spreadsheet row numbers and skips blank rows', async () => {
    const buf = await workbook([
      ['A', 1, '101', '2 BHK', 1200, 'STD', 'Owner'],
      [null, null, null, null, null, null, null],
      ['A', 1, '102', '2 BHK', 1180, 'STD', 'Tenant'],
    ]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([2, 4]);
    expect(parsed.rows[0]!.raw['Flat number']).toBe('101');
  });

  it('rejects a wrong header row', async () => {
    const parsed = await parseWorkbook(await workbook([['A']], ['Tower', 'Flat']));
    expect(parsed.fileErrors[0]).toMatch(/first row must be exactly/);
  });

  it('rejects files that are not xlsx', async () => {
    const parsed = await parseWorkbook(Buffer.from('name,flat\nA,101'));
    expect(parsed.fileErrors[0]).toMatch(/not an \.xlsx/);
  });

  it('rejects an empty workbook', async () => {
    expect((await parseWorkbook(await workbook([]))).fileErrors[0]).toMatch(/no data rows/);
  });

  it('builds a template whose header the parser accepts', async () => {
    const buf = await buildTemplate('Test Community', [{ code: 'STD', label: 'Standard' }]);
    const parsed = await parseWorkbook(buf);
    expect(parsed.fileErrors[0]).toMatch(/no data rows/); // header accepted, no rows yet
  });
});

describe('normalizeRow', () => {
  const ok = { Tower: 'A', Floor: 3, 'Flat number': '301', 'BHK type': '3 BHK', 'Area (sq ft)': '1,450', 'Residence category': 'PREM', Occupancy: 'vacant' };

  it('normalises a valid row', () => {
    const r = normalizeRow(ok);
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ tower: 'A', floor: 3, flatNumber: '301', areaSqft: 1450, categoryRef: 'PREM', occupancy: 'VACANT' });
  });

  it('reports every field problem at once', () => {
    const r = normalizeRow({ ...ok, Tower: '', 'Flat number': '', Floor: 2.5, 'Area (sq ft)': '-1', 'Residence category': '', Occupancy: 'Landlord' });
    expect(r.value).toBeUndefined();
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'Tower is required',
        'Flat number is required',
        expect.stringMatching(/Floor/),
        expect.stringMatching(/Area/),
        'Residence category is required',
        expect.stringMatching(/Occupancy/),
      ]),
    );
  });
});
