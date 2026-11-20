import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import writeXlsxFile from 'write-excel-file/node';
import { IMPORT_COLUMNS } from '@nestovin/contracts';
import { AppError } from '../../src/lib/errors';
import { LocationService } from '../../src/modules/locations/service';
import { CatalogueService } from '../../src/modules/catalogue/service';
import { MigrationService } from '../../src/modules/migration/service';
import type { Database } from '../../src/db/database';
import { actor } from '../helpers/fake-deps';
import { appDatabase, databaseAvailable, uniq } from '../helpers/db';

const available = await databaseAvailable();

const code = (p: Promise<unknown>, c: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === c);

async function xlsx(rows: (string | number | null)[][]) {
  const data = [IMPORT_COLUMNS.map((value) => ({ value })), ...rows.map((r) => r.map((value) => (value === null ? null : { value })))];
  return writeXlsxFile(data as never).toBuffer();
}

describe.skipIf(!available)('community setup: migration, catalogue, activation', () => {
  let db: Database;
  let loc: LocationService;
  let cat: CatalogueService;
  let mig: MigrationService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let communityId: string;
  let otherClusterAdmin: ReturnType<typeof actor>;
  let stdId: string;
  let premId: string;

  beforeAll(async () => {
    db = appDatabase();
    loc = new LocationService(db);
    cat = new CatalogueService(db);
    mig = new MigrationService(db);
    const city = await loc.createCity(root, 't', { name: `Setup City ${s}`, state: 'Telangana' });
    const cluster = await loc.createCluster(root, 't', { name: `Setup ${s}`, code: `SU${s}` });
    const other = await loc.createCluster(root, 't', { name: `Other ${s}`, code: `OT${s}` });
    otherClusterAdmin = actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [other.id] } });
    communityId = (await loc.createCommunity(root, 't', { cityId: city.id, name: `Setup Homes ${s}`, code: `SH${s}`, clusterId: cluster.id })).id;
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('defines residence categories (needed before import)', async () => {
    await cat.createCategory(root, 't', communityId, { code: 'STD', label: 'Standard 2 BHK', sort: 1 });
    await cat.createCategory(root, 't', communityId, { code: 'PREM', label: 'Premium 3 BHK', sort: 2 });
    const list = await cat.listCategories(root, communityId);
    stdId = list.find((c) => c.code === 'STD')!.id;
    premId = list.find((c) => c.code === 'PREM')!.id;
    await code(cat.createCategory(root, 't', communityId, { code: 'std', label: 'dup' }), 'CONFLICT');
  });

  it('hides another cluster’s community from a cluster-scoped admin', async () => {
    await code(cat.listCategories(otherClusterAdmin, communityId), 'NOT_FOUND');
    await code(mig.template(otherClusterAdmin, communityId), 'NOT_FOUND');
  });

  it('flags an invalid workbook row by row and never imports it', async () => {
    const batch = await mig.upload(
      root,
      't',
      communityId,
      'bad.xlsx',
      await xlsx([
        ['A', 1, '101', '2 BHK', 1200, 'STD', 'Owner'],
        ['A', 1, '101', '2 BHK', 1200, 'STD', 'Owner'], // duplicate
        ['B', 2, '201', '3 BHK', 1600, 'LUXURY', 'Owner'], // unknown category
      ]),
    );
    expect(batch.status).toBe('INVALID');
    expect(batch.errorRows).toBe(2);
    const rows = await mig.rows(root, batch.id, { onlyProblems: true, limit: 50 });
    expect(rows.items.map((r) => r.rowNumber)).toEqual([3, 4]);
    expect(rows.items[0]!.errors[0]).toMatch(/Duplicate of row 2/);
    await code(mig.approve(root, 't', batch.id), 'BUSINESS_RULE_VIOLATION');
  });

  it('validates, approves and commits a good workbook all-or-nothing', async () => {
    const batch = await mig.upload(
      root,
      't',
      communityId,
      'good.xlsx',
      await xlsx([
        ['A', 1, '101', '2 BHK', 1200, 'STD', 'Owner'],
        ['A', 1, '102', '2 BHK', 1180, 'Standard 2 BHK', 'Tenant'], // label also accepted
        ['B', 3, '301', '3 BHK', 1650, 'PREM', 'Vacant'],
      ]),
    );
    expect(batch).toMatchObject({ status: 'VALIDATED', validRows: 3, towersNew: 2, flatsNew: 3 });
    // Only one open batch per community.
    await code(mig.upload(root, 't', communityId, 'again.xlsx', await xlsx([['C', 1, '1', null, null, 'STD', null]])), 'CONFLICT');
    await code(mig.commit(root, 't', batch.id), 'BUSINESS_RULE_VIOLATION'); // must be approved first

    await mig.approve(root, 't', batch.id); // same admin may approve (ADR-011)
    const committed = await mig.commit(root, 't', batch.id);
    expect(committed.status).toBe('COMMITTED');

    const community = await loc.getCommunity(root, communityId);
    expect(community.status).toBe('IMPORTED');
    const towers = await loc.listTowers(root, communityId, { limit: 10 });
    expect(towers.items.map((t) => t.name).sort()).toEqual(['A', 'B']);
    const flatsA = await loc.listFlats(root, towers.items.find((t) => t.name === 'A')!.id, { limit: 10 });
    expect(flatsA.items.map((f) => [f.flatNumber, f.residenceCategoryId, f.occupancy])).toEqual([
      ['101', stdId, 'OWNER'],
      ['102', stdId, 'TENANT'],
    ]);
  });

  it('re-import updates changed flats and leaves others untouched', async () => {
    const batch = await mig.upload(root, 't', communityId, 'update.xlsx', await xlsx([['A', 1, '101', '2 BHK', 1250, 'PREM', 'Owner']]));
    expect(batch).toMatchObject({ status: 'VALIDATED', flatsNew: 0, flatsUpdated: 1 });
    await mig.approve(root, 't', batch.id);
    await mig.commit(root, 't', batch.id);
    const towers = await loc.listTowers(root, communityId, { limit: 10 });
    const flats = await loc.listFlats(root, towers.items.find((t) => t.name === 'A')!.id, { limit: 10 });
    expect(flats.items.find((f) => f.flatNumber === '101')).toMatchObject({ residenceCategoryId: premId, areaSqft: 1250 });
    expect(flats.items).toHaveLength(2); // 102 still there
  });

  it('builds, validates and publishes a catalogue, then freezes it', { timeout: 180_000 }, async () => {
    const services = await cat.getServices(root, communityId);
    const maid = services.services.find((x) => x.code === 'MAID')!;
    const caretaker = services.services.find((x) => x.code === 'CARETAKER')!;
    // Enabled service without any mode is rejected.
    await code(
      cat.putServices(root, 't', communityId, { defaultOperatingMode: null, services: [{ serviceId: maid.serviceId, enabled: true, operatingMode: null }] }),
      'BUSINESS_RULE_VIOLATION',
    );
    await cat.putServices(root, 't', communityId, {
      defaultOperatingMode: 'DEMAND_LED',
      services: [
        { serviceId: maid.serviceId, enabled: true, operatingMode: null },
        { serviceId: caretaker.serviceId, enabled: true, operatingMode: 'CONTINUOUS' },
      ],
    });
    await cat.createWindow(root, 't', communityId, { name: 'Morning', startTime: '07:00', endTime: '11:00' });
    const morning = (await cat.listWindows(root, communityId))[0]!;
    await cat.createTask(root, 't', communityId, { serviceId: maid.serviceId, name: 'Sweeping and mopping' });
    await cat.createTask(root, 't', communityId, { serviceId: caretaker.serviceId, name: 'Elder companionship' });
    const tasks = await cat.listTasks(root, communityId);
    const sweep = tasks.find((t) => t.name.startsWith('Sweeping'))!;
    const companion = tasks.find((t) => t.name.startsWith('Elder'))!;

    let draft = await cat.createDraft(root, 't', communityId, { copyFromPublished: true });
    expect(draft).toMatchObject({ status: 'DRAFT', versionNo: 1, plans: [] });
    expect((await cat.validate(root, draft.id)).publishable).toBe(false);

    draft = await cat.createPlan(root, 't', draft.id, { code: 'GOLD', name: 'Gold', validityDays: 30 });
    const gold = draft.plans[0]!;
    await cat.createComponent(root, 't', gold.id, {
      serviceId: maid.serviceId, isOptionalAddon: false, visitsPerDay: 2, daysOfWeek: 127, durationMinutes: 60, timeWindowId: morning.id,
      tasks: [{ serviceTaskId: sweep.id, frequency: 'PER_VISIT', timesPerPeriod: 1 }],
    });
    draft = await cat.createComponent(root, 't', gold.id, {
      serviceId: caretaker.serviceId, isOptionalAddon: true, visitsPerDay: 1, daysOfWeek: 127, durationMinutes: 360, addonHours: 6, timeWindowId: morning.id,
      tasks: [{ serviceTaskId: companion.id, frequency: 'DAILY', timesPerPeriod: 1 }],
    });
    const addon = draft.plans[0]!.components.find((c) => c.isOptionalAddon)!;

    // Gold offered to Premium flats only; Standard cell left empty (= not offered).
    draft = await cat.putPriceMatrix(root, 't', draft.id, {
      cells: [{ planId: gold.id, residenceCategoryId: premId, priceBasis: 'PACKAGE', serviceId: null, amountPaise: 2_200_000 }],
      addonCells: [{ planComponentId: addon.id, residenceCategoryId: premId, amountPaise: 0 }],
    });
    // A service price for a service not in the plan is rejected.
    const cook = services.services.find((x) => x.code === 'COOK')!;
    await code(
      cat.putPriceMatrix(root, 't', draft.id, {
        cells: [{ planId: gold.id, residenceCategoryId: premId, priceBasis: 'SERVICE', serviceId: cook.serviceId, amountPaise: 100 }],
        addonCells: [],
      }),
      'BUSINESS_RULE_VIOLATION',
    );

    const validation = await cat.validate(root, draft.id);
    expect(validation.publishable).toBe(true);
    expect(validation.issues.some((i) => i.code === 'CATEGORY_NOT_OFFERED')).toBe(true);

    const published = await cat.publish(root, 't', draft.id, {});
    expect(published.status).toBe('PUBLISHED');
    expect((await loc.getCommunity(root, communityId)).status).toBe('CONFIGURED');

    // Frozen: API refuses, and the database refuses even a direct write.
    await code(cat.createPlan(root, 't', published.id, { code: 'X', name: 'X', validityDays: 30 }), 'BUSINESS_RULE_VIOLATION');
    await expect(db.updateTable('app.plans').set({ name: 'Hacked' }).where('id', '=', gold.id).execute()).rejects.toThrow(/cannot be changed/);

    // A new draft copies the published version; publishing it supersedes v1.
    const v2 = await cat.createDraft(root, 't', communityId, { copyFromPublished: true });
    expect(v2.versionNo).toBe(2);
    expect(v2.plans[0]!.components).toHaveLength(2);
    expect(v2.prices).toHaveLength(1);
    await cat.publish(root, 't', v2.id, {});
    const versions = await cat.listVersions(root, communityId);
    expect(versions.map((v) => [v.versionNo, v.status])).toEqual([[2, 'PUBLISHED'], [1, 'SUPERSEDED']]);
  });

  it('activates only when the checklist is complete', async () => {
    const list = await mig.checklist(root, communityId);
    expect(list.ready).toBe(true);
    await mig.activate(root, 't', communityId);
    expect((await loc.getCommunity(root, communityId)).status).toBe('ACTIVE');
    await code(mig.activate(root, 't', communityId), 'BUSINESS_RULE_VIOLATION');
  });
});
