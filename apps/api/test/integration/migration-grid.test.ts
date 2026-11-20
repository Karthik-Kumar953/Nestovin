import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readSheet } from 'read-excel-file/node';
import type { Database } from '../../src/db/database';
import { LocationService } from '../../src/modules/locations/service';
import { CatalogueService } from '../../src/modules/catalogue/service';
import { MigrationService } from '../../src/modules/migration/service';
import { actor } from '../helpers/fake-deps';
import { appDatabase, databaseAvailable, uniq } from '../helpers/db';

/* ADM-04: dashboard table entry and structure export use the Excel pipeline's rules. */

const available = await databaseAvailable();

describe.skipIf(!available)('community migration: dashboard table and export', { timeout: 90_000 }, () => {
  let db: Database;
  let mig: MigrationService;
  let communityId: string;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });

  beforeAll(async () => {
    db = appDatabase();
    mig = new MigrationService(db);
    const loc = new LocationService(db);
    const cat = new CatalogueService(db);
    const cityId = (await loc.createCity(root, 't', { name: `Grid City ${s}`, state: 'Telangana' })).id;
    communityId = (await loc.createCommunity(root, 't', { cityId, name: `Grid Homes ${s}`, code: `GH${s}` })).id;
    await cat.createCategory(root, 't', communityId, { code: 'STD', label: 'Standard 2 BHK' });
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it('checks table rows with the same rules and points at the bad rows', async () => {
    const v = await mig.validateGrid(root, communityId, [
      { tower: 'A', flatNumber: '101', category: 'STD', floor: 1 },
      { tower: '', flatNumber: '', category: '' }, // blank rows are ignored
      { tower: 'A', flatNumber: '101', category: 'STD' }, // duplicate
      { tower: 'B', flatNumber: '201', category: 'NOPE' }, // unknown category
    ]);
    expect(v.counts).toMatchObject({ valid: 1, errors: 2 });
    expect(v.rows.find((r) => r.rowNumber === 4)?.errors.join(' ')).toMatch(/Duplicate/);
    expect(v.rows.find((r) => r.rowNumber === 5)?.errors.join(' ')).toMatch(/not defined/);
  });

  it('submits valid table rows as a batch, then approve and commit as usual', async () => {
    const batch = await mig.submitGrid(root, 't', communityId, [
      { tower: 'A', flatNumber: '101', category: 'STD', floor: '1', bhkType: '2 BHK', areaSqft: '1150', occupancy: 'Owner' },
      { tower: 'A', flatNumber: '102', category: 'Standard 2 BHK' },
      { tower: 'B', flatNumber: '201', category: 'STD' },
    ]);
    expect(batch).toMatchObject({ source: 'DASHBOARD', status: 'VALIDATED', totalRows: 3, towersNew: 2, flatsNew: 3 });
    await mig.approve(root, 't', batch.id);
    const committed = await mig.commit(root, 't', batch.id);
    expect(committed.status).toBe('COMMITTED');
  });

  it('exports the current structure in the import format', async () => {
    const { buffer, fileName } = await mig.exportStructure(root, 't', communityId);
    expect(fileName).toMatch(/\.xlsx$/);
    const sheet = (await readSheet(buffer)) as unknown[][];
    expect(sheet[0]?.[0]).toBe('Tower');
    expect(sheet.slice(1).map((r) => `${r[0]}-${r[2]}`)).toEqual(['A-101', 'A-102', 'B-201']);
    expect(sheet[1]?.[5]).toBe('STD');
    expect(sheet[1]?.[6]).toBe('Owner');
  });
});
