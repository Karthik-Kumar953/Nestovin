/**
 * DEVELOPMENT ONLY. Makes both booking flows demo-able in "Green Meadows (Demo)"
 * (code DEMOGM, created by seed:dev-demo). Everything goes through the API's own
 * service classes, acting as the first Super Admin:
 *   - residence categories 1 BHK / 2 BHK / 3 BHK, and a category on every flat
 *     (1201 → 1 BHK, 1202–1203 → 2 BHK, 1204 → 3 BHK)
 *   - services: Maid = CONTINUOUS (open slots), Cook = DEMAND_LED (booking round),
 *     Caretaker = add-on that follows the community default (CONTINUOUS)
 *   - time windows Morning 07:00–11:00 and Evening 16:00–20:00, and service tasks
 *   - a new catalogue version (Maid Essential / Maid Complete with an optional
 *     Caretaker add-on, Cook Essential / Cook Complete), a full price matrix for
 *     every category, validated and published effective today
 *   - published Maid continuous slots, and a published Cook demand cycle open
 *     for the next 14 days with a 25% initial payment
 *
 * Safe to re-run: each step checks what is already there and only adds what is
 * missing. Refuses to run when NODE_ENV is staging or production.
 *
 *   corepack pnpm --filter @nestovin/api seed:dev-demo          # first
 *   corepack pnpm --filter @nestovin/api seed:dev-demo-catalogue
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import type { PriceCell, AddonPriceCell, TaskFrequency } from '@nestovin/contracts';
import type { AdminActor } from '../src/auth/permissions';
import { createDatabase, sslOptions } from '../src/db/database';
import { BookingAdminService } from '../src/modules/bookings/admin-service';
import { CatalogueService } from '../src/modules/catalogue/service';
import { LocationService } from '../src/modules/locations/service';

const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string().min(10),
    DATABASE_ADMIN_URL: z.string().min(10),
    DATABASE_SSL_CA_PATH: z.string().optional(),
  })
  .parse(process.env);
if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
  console.error('seed:dev-demo-catalogue is for development databases only.');
  process.exit(1);
}

const COMMUNITY_CODE = 'DEMOGM';
/** Marks the catalogue this script publishes, so a re-run does not publish it again. */
const MARKER_PLAN = 'MAID-ESSENTIAL';
const rupees = (n: number) => n * 100;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const admin = new pg.Pool({ connectionString: env.DATABASE_ADMIN_URL, max: 2, ssl: sslOptions(env.DATABASE_ADMIN_URL, env.DATABASE_SSL_CA_PATH) });
const db = createDatabase(env.DATABASE_URL, env.DATABASE_SSL_CA_PATH);
const q = (t: string, p: unknown[] = []) => admin.query(t, p);

try {
  const sa = (await q(`select id, email, full_name from app.admin_profiles where is_super_admin and status <> 'DISABLED' order by created_at limit 1`)).rows[0];
  if (!sa) throw new Error('Run bootstrap:super-admin first: the seed acts as the Super Admin.');
  const root: AdminActor = { id: sa.id, email: sa.email, fullName: sa.full_name, isSuperAdmin: true, scope: { type: 'GLOBAL' }, grants: new Set() };
  const rid = `seed-${randomUUID()}`;
  const catalogue = new CatalogueService(db);
  const bookings = new BookingAdminService(db);
  const loc = new LocationService(db);

  const community = (await q(`select id from app.communities where code = $1`, [COMMUNITY_CODE])).rows[0] as { id: string } | undefined;
  if (!community) throw new Error('Run seed:dev-demo first: the demo community does not exist.');
  const cid = community.id;

  // ---- services and operating modes (the owner's per-service "toggle")
  const services = await catalogue.getServices(root, cid);
  const svc = Object.fromEntries(services.services.map((s) => [s.code, s.serviceId])) as Record<'MAID' | 'COOK' | 'CARETAKER', string>;
  const wanted = { MAID: 'CONTINUOUS', COOK: 'DEMAND_LED', CARETAKER: null } as const;
  const modesOk =
    services.defaultOperatingMode === 'CONTINUOUS' &&
    services.services.every((s) => s.enabled && s.operatingMode === wanted[s.code as keyof typeof wanted]);
  if (!modesOk) {
    await catalogue.putServices(root, rid, cid, {
      defaultOperatingMode: 'CONTINUOUS',
      services: services.services.map((s) => ({ serviceId: s.serviceId, enabled: true, operatingMode: wanted[s.code as keyof typeof wanted] ?? null })),
    });
    console.warn('✓ Services: Maid = open slots (CONTINUOUS), Cook = demand collection (DEMAND_LED), Caretaker = community default (CONTINUOUS)');
  }

  // ---- residence categories and flat assignment
  const catDefs = [
    { code: '1BHK', label: '1 BHK', sort: 1 },
    { code: '2BHK', label: '2 BHK', sort: 2 },
    { code: '3BHK', label: '3 BHK', sort: 3 },
  ] as const;
  let cats = await catalogue.listCategories(root, cid);
  for (const d of catDefs) {
    if (!cats.some((c) => c.code === d.code)) {
      await catalogue.createCategory(root, rid, cid, d);
      console.warn(`✓ Residence category ${d.label}`);
    }
  }
  cats = await catalogue.listCategories(root, cid);
  const cat = Object.fromEntries(cats.map((c) => [c.code, c.id])) as Record<'1BHK' | '2BHK' | '3BHK', string>;
  const flatCategory: Record<string, keyof typeof cat> = { '1201': '1BHK', '1202': '2BHK', '1203': '2BHK', '1204': '3BHK' };
  const flats = (
    await q(`select f.id, f.flat_number, f.residence_category_id, f.version from app.flats f join app.towers t on t.id = f.tower_id where t.community_id = $1 order by f.flat_number`, [cid])
  ).rows as { id: string; flat_number: string; residence_category_id: string | null; version: number }[];
  for (const f of flats) {
    const want = cat[flatCategory[f.flat_number] ?? '2BHK'];
    if (f.residence_category_id !== want) {
      await loc.updateFlat(root, rid, f.id, { residenceCategoryId: want, version: f.version });
      console.warn(`✓ Flat ${f.flat_number} → ${flatCategory[f.flat_number] ?? '2BHK'}`);
    }
  }

  // ---- time windows
  let windows = await catalogue.listWindows(root, cid);
  for (const w of [
    { name: 'Morning', startTime: '07:00', endTime: '11:00' },
    { name: 'Evening', startTime: '16:00', endTime: '20:00' },
  ]) {
    if (!windows.some((x) => x.name === w.name)) {
      await catalogue.createWindow(root, rid, cid, w);
      console.warn(`✓ Time window ${w.name} ${w.startTime}–${w.endTime}`);
    }
  }
  windows = await catalogue.listWindows(root, cid);
  const win = Object.fromEntries(windows.map((w) => [w.name, w.id])) as Record<'Morning' | 'Evening', string>;

  // ---- service tasks
  const taskDefs: Record<'MAID' | 'COOK' | 'CARETAKER', [string, number][]> = {
    MAID: [
      ['Sweeping and mopping', 30],
      ['Dish washing', 20],
      ['Dusting of furniture', 15],
      ['Bathroom cleaning', 30],
      ['Balcony and window cleaning', 30],
      ['Kitchen deep clean', 45],
    ],
    COOK: [
      ['Meal preparation', 45],
      ['Vegetable cutting and prep', 15],
      ['Kitchen counter cleaning', 10],
      ['Weekly menu planning', 15],
      ['Refrigerator wipe-down', 15],
    ],
    CARETAKER: [
      ['Companionship and supervision', 60],
      ['Medication reminders', 5],
      ['Assistance with meals', 30],
    ],
  };
  let tasks = await catalogue.listTasks(root, cid);
  for (const [code, list] of Object.entries(taskDefs) as [keyof typeof taskDefs, [string, number][]][]) {
    for (const [name, minutes] of list) {
      if (!tasks.some((t) => t.serviceId === svc[code] && t.name === name)) {
        await catalogue.createTask(root, rid, cid, { serviceId: svc[code], name, defaultDurationMin: minutes });
      }
    }
  }
  tasks = await catalogue.listTasks(root, cid);
  const task = (code: keyof typeof taskDefs, name: string) => {
    const t = tasks.find((x) => x.serviceId === svc[code] && x.name === name);
    if (!t) throw new Error(`Task ${name} missing`);
    return t.id;
  };
  const t = (code: keyof typeof taskDefs, name: string, frequency: TaskFrequency, timesPerPeriod = 1) => ({
    serviceTaskId: task(code, name),
    frequency,
    timesPerPeriod,
  });

  // ---- catalogue: a new version with real plans and a full price matrix, published today
  const versions = await catalogue.listVersions(root, cid);
  const published = versions.find((v) => v.status === 'PUBLISHED');
  const publishedDetail = published ? await catalogue.getVersion(root, published.id) : null;
  if (!publishedDetail?.plans.some((p) => p.code === MARKER_PLAN)) {
    const staleDraft = versions.find((v) => v.status === 'DRAFT');
    if (staleDraft) {
      await catalogue.discardDraft(root, rid, staleDraft.id);
      console.warn(`• Discarded an unfinished draft (version ${staleDraft.versionNo})`);
    }
    const draft = await catalogue.createDraft(root, rid, cid, { copyFromPublished: false, notes: 'Demo catalogue: Maid (open slots), Cook (booking round), Caretaker add-on' });
    const plan = async (code: string, name: string, description: string, sort: number) =>
      (await catalogue.createPlan(root, rid, draft.id, { code, name, description, validityDays: 30, sort })).plans.find((p) => p.code === code)!.id;

    const maidEss = await plan(MARKER_PLAN, 'Maid Essential', 'Daily home cleaning: sweeping, mopping, dishes and dusting.', 1);
    const maidCom = await plan('MAID-COMPLETE', 'Maid Complete', 'Everything in Essential plus weekly bathroom and balcony cleaning and a monthly kitchen deep clean.', 2);
    const cookEss = await plan('COOK-ESSENTIAL', 'Cook Essential', 'One home-cooked meal session a day, with prep and a clean kitchen counter.', 3);
    const cookCom = await plan('COOK-COMPLETE', 'Cook Complete', 'Lunch and dinner cooked fresh every day, with weekly menu planning.', 4);

    const daily = 127;
    await catalogue.createComponent(root, rid, maidEss, {
      serviceId: svc.MAID, isOptionalAddon: false, visitsPerDay: 1, daysOfWeek: daily, durationMinutes: 60, timeWindowId: win.Morning,
      tasks: [t('MAID', 'Sweeping and mopping', 'PER_VISIT'), t('MAID', 'Dish washing', 'PER_VISIT'), t('MAID', 'Dusting of furniture', 'PER_VISIT')],
    });
    await catalogue.createComponent(root, rid, maidCom, {
      serviceId: svc.MAID, isOptionalAddon: false, visitsPerDay: 1, daysOfWeek: daily, durationMinutes: 120, timeWindowId: win.Morning,
      tasks: [
        t('MAID', 'Sweeping and mopping', 'PER_VISIT'), t('MAID', 'Dish washing', 'PER_VISIT'), t('MAID', 'Dusting of furniture', 'PER_VISIT'),
        t('MAID', 'Bathroom cleaning', 'WEEKLY', 2), t('MAID', 'Balcony and window cleaning', 'WEEKLY'), t('MAID', 'Kitchen deep clean', 'MONTHLY', 2),
      ],
    });
    const caretaker = {
      serviceId: svc.CARETAKER, isOptionalAddon: true, visitsPerDay: 1, daysOfWeek: daily, durationMinutes: 240, timeWindowId: win.Evening, addonHours: 4,
      tasks: [t('CARETAKER', 'Companionship and supervision', 'PER_VISIT'), t('CARETAKER', 'Medication reminders', 'PER_VISIT'), t('CARETAKER', 'Assistance with meals', 'PER_VISIT')],
    };
    await catalogue.createComponent(root, rid, maidEss, caretaker);
    await catalogue.createComponent(root, rid, maidCom, caretaker);
    await catalogue.createComponent(root, rid, cookEss, {
      serviceId: svc.COOK, isOptionalAddon: false, visitsPerDay: 1, daysOfWeek: daily, durationMinutes: 60, timeWindowId: win.Morning,
      tasks: [t('COOK', 'Meal preparation', 'PER_VISIT'), t('COOK', 'Vegetable cutting and prep', 'PER_VISIT'), t('COOK', 'Kitchen counter cleaning', 'PER_VISIT')],
    });
    const detail = await catalogue.createComponent(root, rid, cookCom, {
      serviceId: svc.COOK, isOptionalAddon: false, visitsPerDay: 2, daysOfWeek: daily, durationMinutes: 75, timeWindowId: null,
      tasks: [
        t('COOK', 'Meal preparation', 'PER_VISIT'), t('COOK', 'Vegetable cutting and prep', 'PER_VISIT'), t('COOK', 'Kitchen counter cleaning', 'PER_VISIT'),
        t('COOK', 'Weekly menu planning', 'WEEKLY'), t('COOK', 'Refrigerator wipe-down', 'WEEKLY'),
      ],
    });

    // Monthly prices in rupees (incl. taxes) by 1 BHK / 2 BHK / 3 BHK. Stored as integer paise.
    const matrix: [string, string, [number, number, number]][] = [
      [maidEss, svc.MAID, [3200, 4200, 5200]],
      [maidCom, svc.MAID, [5500, 7000, 8500]],
      [cookEss, svc.COOK, [4000, 4800, 5600]],
      [cookCom, svc.COOK, [7500, 8500, 9500]],
    ];
    const order = ['1BHK', '2BHK', '3BHK'] as const;
    const cells: PriceCell[] = matrix.flatMap(([planId, serviceId, amounts]) =>
      order.map((c, i) => ({ planId, residenceCategoryId: cat[c], priceBasis: 'SERVICE' as const, serviceId, amountPaise: rupees(amounts[i]!) })),
    );
    const caretakerPrices = [9000, 9000, 10000];
    const addonCells: AddonPriceCell[] = detail.plans
      .flatMap((p) => p.components.filter((c) => c.isOptionalAddon))
      .flatMap((c) => order.map((k, i) => ({ planComponentId: c.id, residenceCategoryId: cat[k], amountPaise: rupees(caretakerPrices[i]!) })));
    await catalogue.putPriceMatrix(root, rid, draft.id, { cells, addonCells });

    const validation = await catalogue.validate(root, draft.id);
    for (const i of validation.issues) console.warn(`  ${i.severity}: ${i.message}`);
    if (!validation.publishable) throw new Error('The demo catalogue did not validate; see the issues above.');
    await catalogue.publish(root, rid, draft.id, { effectiveFrom: today, notes: 'Demo catalogue' });
    console.warn(`✓ Published catalogue version ${draft.versionNo} (4 plans × 3 categories, Caretaker add-on), effective ${today}`);
  } else {
    console.warn(`• Demo catalogue already published (version ${published!.versionNo})`);
  }

  // ---- Maid continuous slots (published, bookable from tomorrow up to the booking window)
  const slotDefs = [
    { label: 'Maid · 7:00 AM', startTime: '07:00', durationMinutes: 120, capacity: 8 },
    { label: 'Maid · 9:00 AM', startTime: '09:00', durationMinutes: 120, capacity: 8 },
    { label: 'Maid · 5:00 PM', startTime: '17:00', durationMinutes: 120, capacity: 6 },
  ];
  let slots = await bookings.listSlots(root, cid);
  for (const d of slotDefs) {
    if (!slots.some((s) => s.label === d.label && s.status !== 'WITHDRAWN')) {
      slots = await bookings.createSlot(root, rid, cid, { ...d, serviceId: svc.MAID, daysOfWeek: 127 });
    }
    const s = slots.find((x) => x.label === d.label && x.status !== 'WITHDRAWN')!;
    if (s.status === 'DRAFT') {
      await bookings.updateSlot(root, rid, s.id, { status: 'PUBLISHED', version: s.version });
      console.warn(`✓ Published continuous slot ${d.label} (capacity ${d.capacity})`);
    }
  }

  // ---- Cook demand cycle (published, open now for 14 days, 25% initial payment)
  const current = (await catalogue.listVersions(root, cid)).find((v) => v.status === 'PUBLISHED')!;
  const currentDetail = await catalogue.getVersion(root, current.id);
  const cookPlanIds = currentDetail.plans.filter((p) => p.components.some((c) => !c.isOptionalAddon && c.serviceId === svc.COOK)).map((p) => p.id);
  const cycles = await bookings.listCycles(root, cid);
  const now = Date.now();
  const openCycle = cycles.find(
    (c) => c.status === 'PUBLISHED' && new Date(c.opensAt).getTime() <= now && new Date(c.closesAt).getTime() > now && c.planIds.some((p) => cookPlanIds.includes(p)),
  );
  if (!openCycle) {
    const monthName = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long' }).format(new Date(now + 14 * 86_400_000));
    const cycle = await bookings.createCycle(root, rid, cid, {
      name: `Cook round · ${monthName}`,
      opensAt: new Date(now - 60_000).toISOString(),
      closesAt: new Date(now + 14 * 86_400_000).toISOString(),
      initialPct: 25,
      planIds: cookPlanIds,
    });
    await bookings.publishCycle(root, rid, cycle.id, cycle.version);
    console.warn(`✓ Published demand cycle "${cycle.name}" (25% initial, closes ${cycle.closesAt.slice(0, 10)})`);
  } else {
    console.warn(`• Demand cycle "${openCycle.name}" is already open (closes ${openCycle.closesAt.slice(0, 10)})`);
  }
  console.warn('Done. Sign in to the Resident app with Demo login and open the Book tab.');
} finally {
  await db.destroy();
  await admin.end();
}
