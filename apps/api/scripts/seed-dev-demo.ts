/**
 * DEVELOPMENT ONLY. Seeds a small, realistic demo so the Worker and Resident
 * apps can be tested end to end:
 *   - city, cluster, community "Green Meadows (Demo)" with one tower and flats
 *   - a published catalogue, two verified households with active Cook / Maid
 *     subscriptions whose terms snapshots list the agreed tasks
 *   - a READY worker with login enabled and a standing assignment, so visits
 *     exist today (about 1 h and 3 h from now, IST) and on following days
 *
 * The worker's Employee ID and temporary password are written to
 * apps/api/.dev-testworker.txt (git-ignored); nothing secret is printed.
 * Refuses to run when NODE_ENV is staging or production. Safe to re-run: an
 * existing demo community is reused and only missing pieces are added.
 *
 *   corepack pnpm --filter @nestovin/api seed:dev-demo
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import type { AdminActor } from '../src/auth/permissions';
import { createDatabase, sslOptions } from '../src/db/database';
import { createSupabaseAuthAdmin } from '../src/integrations/auth-admin';
import { addDays } from '../src/modules/bookings/pricing';
import { LocationService } from '../src/modules/locations/service';
import { WorkforceAdminService } from '../src/modules/workforce/admin-service';
import { AllocationService } from '../src/modules/workforce/allocation';

const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string().min(10),
    DATABASE_ADMIN_URL: z.string().min(10),
    DATABASE_SSL_CA_PATH: z.string().optional(),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  })
  .parse(process.env);
if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
  console.error('seed:dev-demo is for development databases only.');
  process.exit(1);
}

const COMMUNITY_CODE = 'DEMOGM';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
/** HH:MM in Asia/Kolkata, `minutes` from now, rounded to the next 15 minutes. */
function istTime(minutes: number): string {
  const d = new Date(Math.ceil((Date.now() + minutes * 60_000) / 900_000) * 900_000);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

const admin = new pg.Pool({ connectionString: env.DATABASE_ADMIN_URL, max: 2, ssl: sslOptions(env.DATABASE_ADMIN_URL, env.DATABASE_SSL_CA_PATH) });
const db = createDatabase(env.DATABASE_URL, env.DATABASE_SSL_CA_PATH);
const q = (t: string, p: unknown[] = []) => admin.query(t, p);

try {
  const sa = (await q(`select id, email, full_name from app.admin_profiles where is_super_admin and status <> 'DISABLED' order by created_at limit 1`)).rows[0];
  if (!sa) throw new Error('Run bootstrap:super-admin first: the seed acts as the Super Admin.');
  const root: AdminActor = { id: sa.id, email: sa.email, fullName: sa.full_name, isSuperAdmin: true, scope: { type: 'GLOBAL' }, grants: new Set() };
  const loc = new LocationService(db);
  const hr = new WorkforceAdminService(db, createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }));
  const alloc = new AllocationService(db);
  const rid = `seed-${randomUUID()}`;

  // ---- places
  let community = (await q(`select id, cluster_id from app.communities where code = $1`, [COMMUNITY_CODE])).rows[0] as { id: string; cluster_id: string } | undefined;
  let clusterId: string;
  if (!community) {
    const city = (await q(`select id from app.cities where name = 'Bengaluru'`)).rows[0]?.id ?? (await loc.createCity(root, rid, { name: 'Bengaluru', state: 'Karnataka' })).id;
    clusterId = (await loc.createCluster(root, rid, { name: 'Demo Cluster South', code: 'DEMOS' })).id;
    const id = (await loc.createCommunity(root, rid, { cityId: city, name: 'Green Meadows (Demo)', code: COMMUNITY_CODE, clusterId })).id;
    const tower = (await loc.createTower(root, rid, { communityId: id, name: 'Tower B' })).id;
    for (const n of ['1201', '1202', '1203', '1204']) await loc.createFlat(root, rid, { towerId: tower, flatNumber: n, floor: 12 });
    await q(`update app.communities set status = 'ACTIVE', location_lat = 12.913000, location_lng = 77.682000 where id = $1`, [id]);
    community = { id, cluster_id: clusterId };
    console.warn('✓ Created Green Meadows (Demo), Tower B, flats 1201–1204');
  }
  clusterId = (await q(`select cluster_id from app.cluster_community_memberships where community_id = $1 and effective_to is null`, [community.id])).rows[0]?.cluster_id ?? community.cluster_id;

  // ---- catalogue (minimal, published)
  const svc = Object.fromEntries((await q(`select code, id from app.services`)).rows.map((r) => [r.code, r.id])) as Record<string, string>;
  let cat = (await q(`select id from app.residence_categories where community_id = $1 and code = '2BHK'`, [community.id])).rows[0]?.id;
  cat ??= (await q(`insert into app.residence_categories (community_id, code, label) values ($1, '2BHK', '2 BHK') returning id`, [community.id])).rows[0].id;
  let ver = (await q(`select id from app.catalogue_versions where community_id = $1 order by version_no limit 1`, [community.id])).rows[0]?.id;
  let plan: string;
  if (!ver) {
    ver = (await q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [community.id])).rows[0].id;
    plan = (await q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'DEMO', 'Demo plan', 30) returning id`, [ver])).rows[0].id;
    await q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [ver]);
  } else {
    plan = (await q(`select id from app.plans where catalogue_version_id = $1 limit 1`, [ver])).rows[0].id;
  }
  let slot = (await q(`select id from app.slots where community_id = $1 limit 1`, [community.id])).rows[0]?.id;
  slot ??= (await q(`insert into app.slots (community_id, mode, label, start_time, duration_minutes, capacity, status) values ($1, 'CONTINUOUS', 'Morning', '07:00', 90, 10, 'PUBLISHED') returning id`, [community.id])).rows[0].id;

  // ---- worker
  let worker = (await q(`select id, employee_code from app.employees where full_name = 'Lakshmi (Demo)' and home_cluster_id = $1`, [clusterId])).rows[0] as { id: string; employee_code: string } | undefined;
  let tempPassword: string | null = null;
  if (!worker) {
    const d = await hr.createEmployee(root, rid, { fullName: 'Lakshmi (Demo)', phone: `+9190000${Math.floor(10000 + Math.random() * 89999)}`, homeClusterId: clusterId });
    for (const item of (await q(`select id from app.verification_items where status = 'ACTIVE'`)).rows) await hr.setVerification(root, rid, d.id, item.id, { status: 'VERIFIED' });
    await hr.setQualifications(root, rid, d.id, [svc.COOK!, svc.MAID!]);
    await hr.setReadiness(root, rid, d.id, { readiness: 'READY', version: (await hr.detail(root, d.id)).version });
    const login = await hr.enableLogin(root, rid, d.id);
    tempPassword = login.temporaryPassword;
    worker = { id: d.id, employee_code: d.employeeCode };
    console.warn(`✓ Created worker ${d.employeeCode} with login enabled`);
  }

  // ---- households with subscriptions + standing assignment (only if the worker has no visits today)
  const hasToday = (await q(`select 1 from app.occurrence_assignments a join app.service_occurrences o on o.id = a.occurrence_id where a.employee_id = $1 and a.status = 'ACTIVE' and o.scheduled_date = $2 limit 1`, [worker.id, today])).rowCount;
  if (!hasToday) {
    const flats = (await q(`select f.id, f.flat_number from app.flats f join app.towers t on t.id = f.tower_id where t.community_id = $1 order by f.flat_number`, [community.id])).rows;
    const households = [
      { flat: flats[3], name: 'Ananya Rao (Demo)', service: 'COOK', start: istTime(60), minutes: 90, tasks: [['Meal preparation', 'PER_VISIT', 1], ['Kitchen counter cleaning', 'PER_VISIT', 1], ['Refrigerator wipe-down', 'WEEKLY', 1]] },
      { flat: flats[1], name: 'Vikram Shah (Demo)', service: 'MAID', start: istTime(180), minutes: 60, tasks: [['Sweeping and mopping', 'PER_VISIT', 1], ['Dish washing', 'PER_VISIT', 1], ['Bathroom deep clean', 'WEEKLY', 1]] },
    ];
    // DEMO_RESIDENT_PHONE (E.164, e.g. +919999900001): the first household uses this number, so a
    // Supabase test OTP for it signs in as that resident on a phone. Unused if already taken.
    let ownPhone = process.env.DEMO_RESIDENT_PHONE?.trim();
    if (ownPhone && !/^\+91\d{10}$/.test(ownPhone)) throw new Error('DEMO_RESIDENT_PHONE must look like +91XXXXXXXXXX');
    if (ownPhone && (await q(`select 1 from auth.users where phone = $1`, [ownPhone.slice(1)])).rowCount) {
      console.warn('DEMO_RESIDENT_PHONE already belongs to a user; the demo households get random numbers.');
      ownPhone = undefined;
    }
    for (const h of households) {
      const residentId = randomUUID();
      const phone = ownPhone ?? `+9199000${Math.floor(10000 + Math.random() * 89999)}`;
      if (ownPhone) console.warn(`✓ ${h.name} signs in with DEMO_RESIDENT_PHONE`);
      ownPhone = undefined;
      await q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [residentId, phone.slice(1)]);
      await q(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, $3)`, [residentId, phone, h.name]);
      const m = (await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED') returning id, cluster_id`, [residentId, h.flat.id])).rows[0];
      const snapshot = {
        planName: 'Demo plan',
        selectionLabel: h.service === 'COOK' ? 'Cook' : 'Maid',
        components: [{ serviceId: svc[h.service], isAddon: false, durationMinutes: h.minutes, daysOfWeek: 127, visitsPerDay: 1, tasks: h.tasks.map(([name, frequency, timesPerPeriod]) => ({ name, frequency, timesPerPeriod })) }],
      };
      const snap = (
        await q(
          `insert into app.booking_terms_snapshots (resident_id, flat_id, community_id, cluster_id, catalogue_version_id, plan_id, residence_category_id, plan_snapshot, total_paise, initial_due_paise, remaining_due_paise, validity_days)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, 30) returning id`,
          [residentId, h.flat.id, community.id, m.cluster_id, ver, plan, cat, JSON.stringify(snapshot)],
        )
      ).rows[0].id;
      const b = (await q(`insert into app.bookings (mode, resident_id, membership_id, flat_id, community_id, cluster_id, terms_snapshot_id, slot_id, start_date, status) values ('CONTINUOUS', $1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED') returning id`, [residentId, m.id, h.flat.id, community.id, m.cluster_id, snap, slot, today])).rows[0].id;
      const sub = (await q(`insert into app.subscriptions (booking_id, resident_id, flat_id, community_id, cluster_id, period_start, period_end, status) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE') returning id`, [b, residentId, h.flat.id, community.id, m.cluster_id, today, addDays(today, 29)])).rows[0].id;
      const comp = (await q(`insert into app.subscription_components (subscription_id, cluster_id, service_id, start_time, duration_minutes, days_of_week, visits_per_day) values ($1, $2, $3, $4, $5, 127, 1) returning id`, [sub, m.cluster_id, svc[h.service], h.start, h.minutes])).rows[0].id;
      await alloc.confirmStanding(root, rid, comp, { employeeId: worker.id });
      console.warn(`✓ ${h.service} visit for flat ${h.flat.flat_number} today at ${h.start} IST, assigned to ${worker.employee_code}`);
    }
  } else {
    console.warn(`• ${worker.employee_code} already has visits today; nothing to add.`);
  }

  if (tempPassword) {
    writeFileSync(
      resolve(import.meta.dirname, '../.dev-testworker.txt'),
      [
        '# DEVELOPMENT test worker for the Worker app. Git-ignored. First sign-in forces a password change.',
        `employee_id=${worker.employee_code}`,
        `temporary_password=${tempPassword}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    console.warn('✓ Worker credentials written to apps/api/.dev-testworker.txt');
  }
} finally {
  await db.destroy();
  await admin.end();
}
