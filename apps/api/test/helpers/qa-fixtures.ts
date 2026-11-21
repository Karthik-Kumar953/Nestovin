import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { hmacHex, type PaymentProvider, type ProviderPayment } from '../../src/integrations/razorpay';
import { LocationService } from '../../src/modules/locations/service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import type { AdminActor } from '../../src/auth/permissions';
import type { Database } from '../../src/db/database';
import { uniq } from './db';

/*
 * QA fixtures for the shared dev database.
 *
 * Every fixture is namespaced (names/codes contain "QA" + a random suffix) and
 * removed in afterAll by `cleanup()`, which walks foreign keys from the roots
 * downwards. Evidence tables are append-only by trigger, so cleanup runs in one
 * transaction with `session_replication_role = replica` (triggers off) and
 * therefore must delete children explicitly: that is what the FK walk does.
 * Audit rows reference targets by text, not FK, and are left as evidence.
 */

export const TEST_KEY_SECRET = 'qa-key-secret-123456';
export const TEST_WEBHOOK_SECRET = 'qa-webhook-secret-123456';

/** Razorpay stand-in that signs exactly like the real one (HMAC-SHA256 hex). */
export class FakeRazorpay implements PaymentProvider {
  readonly keyId = 'rzp_test_qa';
  orders = new Map<string, { amount: number }>();
  payments = new Map<string, ProviderPayment>();
  async createOrder(input: { amountPaise: number }) {
    const id = `order_${randomUUID().slice(0, 12)}`;
    this.orders.set(id, { amount: input.amountPaise });
    return { id };
  }
  async fetchPayment(id: string) {
    const p = this.payments.get(id);
    if (!p) throw new Error('no such payment');
    return p;
  }
  async fetchOrderPayments(orderId: string) {
    return [...this.payments.values()].filter((p) => p.orderId === orderId);
  }
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
    return hmacHex(TEST_KEY_SECRET, `${orderId}|${paymentId}`) === signature;
  }
  verifyWebhookSignature(raw: Buffer, signature: string) {
    return hmacHex(TEST_WEBHOOK_SECRET, raw) === signature;
  }
  /** Simulates Checkout; returns what the app would send to /payments/verify. */
  pay(providerOrderId: string, opts: { amount?: number; currency?: string; status?: ProviderPayment['status'] } = {}) {
    const id = `pay_${randomUUID().slice(0, 12)}`;
    this.payments.set(id, {
      id,
      orderId: providerOrderId,
      amountPaise: opts.amount ?? this.orders.get(providerOrderId)!.amount,
      currency: opts.currency ?? 'INR',
      status: opts.status ?? 'captured',
      method: 'upi',
    });
    return { providerPaymentId: id, signature: hmacHex(TEST_KEY_SECRET, `${providerOrderId}|${id}`) };
  }
}

export function signedWebhook(body: unknown) {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, signature: hmacHex(TEST_WEBHOOK_SECRET, raw) };
}

export function capturedEvent(p: ProviderPayment) {
  return {
    event: 'payment.captured',
    payload: { payment: { entity: { id: p.id, order_id: p.orderId, amount: p.amountPaise, currency: p.currency, status: p.status, method: p.method } } },
  };
}

export const randomPhone = () => `+9196${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

/** Tracks everything a suite creates so afterAll can remove it. */
export class Fixtures {
  readonly s = uniq();
  readonly clusters: string[] = [];
  readonly cities: string[] = [];
  readonly residents: string[] = [];
  readonly authUsers: string[] = [];
  constructor(private readonly admin: pg.Pool) {}

  q(text: string, params: unknown[] = []) {
    return this.admin.query(text, params);
  }

  async resident(opts: { flatId?: string; status?: 'VERIFIED' | 'PENDING' } = {}): Promise<ResidentActor> {
    const r: ResidentActor = { id: randomUUID(), phone: randomPhone() };
    await this.q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [r.id, r.phone.slice(1)]);
    this.authUsers.push(r.id);
    await this.q(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, $3)`, [r.id, r.phone, `QA ${this.s} ${r.id.slice(0, 4)}`]);
    this.residents.push(r.id);
    if (opts.flatId) {
      const verified = (opts.status ?? 'VERIFIED') === 'VERIFIED';
      await this.q(
        `insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status, verified_at) values ($1, $2, 'PRIMARY', 'OWNER', $3, $4)`,
        [r.id, opts.flatId, verified ? 'VERIFIED' : 'PENDING', verified ? new Date() : null],
      );
    }
    return r;
  }

  /** Removes everything reachable by foreign key from the tracked roots. */
  async cleanup(): Promise<void> {
    const client = await this.admin.connect();
    try {
      await client.query('begin');
      await client.query('set local session_replication_role = replica');
      const walker = new FkWalker(client);
      await walker.delete('app', 'resident_profiles', this.residents);
      await walker.delete('app', 'clusters', this.clusters);
      await walker.delete('app', 'cities', this.cities);
      if (this.authUsers.length) await client.query(`delete from auth.users where id = any($1::uuid[])`, [this.authUsers]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      // Never fail a suite on cleanup; say what was left behind.
      console.warn(`[qa-fixtures] cleanup failed for suffix ${this.s}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

interface ChildFk {
  schema: string;
  table: string;
  column: string;
  hasId: boolean;
}

/** Manual ON DELETE CASCADE that also works with triggers disabled. */
class FkWalker {
  private readonly cache = new Map<string, ChildFk[]>();
  constructor(private readonly client: pg.PoolClient) {}

  private async children(schema: string, table: string): Promise<ChildFk[]> {
    const k = `${schema}.${table}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const { rows } = await this.client.query<{ schema: string; table: string; column: string; has_id: boolean }>(
      `select n.nspname as schema, cl.relname as table, a.attname as column,
              exists (select 1 from pg_attribute i where i.attrelid = cl.oid and i.attname = 'id' and not i.attisdropped) as has_id
         from pg_constraint c
         join pg_class cl on cl.oid = c.conrelid
         join pg_namespace n on n.oid = cl.relnamespace
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and array_length(c.conkey, 1) = 1
          and c.confrelid = format('%I.%I', $1::text, $2::text)::regclass`,
      [schema, table],
    );
    const out = rows.map((r) => ({ schema: r.schema, table: r.table, column: r.column, hasId: r.has_id }));
    this.cache.set(k, out);
    return out;
  }

  async delete(schema: string, table: string, ids: string[], depth = 0): Promise<void> {
    if (ids.length === 0 || depth > 12) return;
    for (const child of await this.children(schema, table)) {
      if (child.schema === schema && child.table === table) {
        // self reference (e.g. parent_id): rows are deleted with the parent set below
        continue;
      }
      if (child.hasId) {
        const { rows } = await this.client.query<{ id: string }>(
          `select id::text from ${q(child.schema)}.${q(child.table)} where ${q(child.column)}::text = any($1::text[])`,
          [ids],
        );
        await this.delete(child.schema, child.table, rows.map((r) => r.id), depth + 1);
      } else {
        await this.client.query(`delete from ${q(child.schema)}.${q(child.table)} where ${q(child.column)}::text = any($1::text[])`, [ids]);
      }
    }
    await this.client.query(`delete from ${q(schema)}.${q(table)} where id::text = any($1::text[])`, [ids]);
  }
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/**
 * A commercial fixture: one city, two clusters (north/south), one ACTIVE
 * community in north with MAID (demand-led), COOK (continuous) and CARETAKER
 * add-on, a published catalogue with a Silver plan and prices, and N flats.
 * Mirrors the Phase 4 suite so PAY/FLOW cases share realistic data.
 */
export async function commercialFixture(fx: Fixtures, db: Database, root: AdminActor, flatCount = 6) {
  const loc = new LocationService(db);
  const s = fx.s;
  const cityId = (await loc.createCity(root, 'qa', { name: `QA City ${s}`, state: 'Telangana' })).id;
  fx.cities.push(cityId);
  const north = (await loc.createCluster(root, 'qa', { name: `QA North ${s}`, code: `QN${s}` })).id;
  const south = (await loc.createCluster(root, 'qa', { name: `QA South ${s}`, code: `QS${s}` })).id;
  fx.clusters.push(north, south);
  const communityId = (await loc.createCommunity(root, 'qa', { cityId, name: `QA Alpha ${s}`, code: `QA${s}`, clusterId: north })).id;
  const southCommunityId = (await loc.createCommunity(root, 'qa', { cityId, name: `QA Beta ${s}`, code: `QB${s}`, clusterId: south })).id;
  const tower = (await loc.createTower(root, 'qa', { communityId, name: 'T1' })).id;
  const flats: string[] = [];
  for (let i = 0; i < flatCount; i++) flats.push((await loc.createFlat(root, 'qa', { towerId: tower, flatNumber: String(101 + i) })).id);
  const southTower = (await loc.createTower(root, 'qa', { communityId: southCommunityId, name: 'S1' })).id;
  const southFlat = (await loc.createFlat(root, 'qa', { towerId: southTower, flatNumber: '901' })).id;

  const svc = (await fx.q(`select id, code from app.services`)).rows as { id: string; code: string }[];
  const ids = {
    maid: svc.find((x) => x.code === 'MAID')!.id,
    cook: svc.find((x) => x.code === 'COOK')!.id,
    caretaker: svc.find((x) => x.code === 'CARETAKER')!.id,
  };
  await fx.q(`update app.communities set status = 'ACTIVE', default_operating_mode = 'CONTINUOUS' where id = $1`, [communityId]);
  await fx.q(
    `insert into app.community_services (community_id, service_id, enabled, operating_mode) values
       ($1, $2, true, 'DEMAND_LED'), ($1, $3, true, 'CONTINUOUS'), ($1, $4, true, 'DEMAND_LED')`,
    [communityId, ids.maid, ids.cook, ids.caretaker],
  );
  const category = (await fx.q(`insert into app.residence_categories (community_id, code, label) values ($1, '2BHK', '2 BHK') returning id`, [communityId])).rows[0].id as string;
  await fx.q(`update app.flats set residence_category_id = $1 where id = any($2)`, [category, flats]);
  const windowId = (await fx.q(`insert into app.time_windows (community_id, name, start_time, end_time) values ($1, 'Morning', '07:00', '11:00') returning id`, [communityId])).rows[0].id as string;
  const version = (await fx.q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [communityId])).rows[0].id as string;
  const planId = (await fx.q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'SILVER', 'Silver', 30) returning id`, [version])).rows[0].id as string;
  await fx.q(`insert into app.plan_components (plan_id, service_id, duration_minutes, time_window_id) values ($1, $2, 60, $4), ($1, $3, 90, $4)`, [planId, ids.maid, ids.cook, windowId]);
  await fx.q(
    `insert into app.plan_prices (catalogue_version_id, plan_id, residence_category_id, price_basis, service_id, amount_paise) values
       ($1, $2, $3, 'SERVICE', $4, 300000), ($1, $2, $3, 'SERVICE', $5, 500000), ($1, $2, $3, 'PACKAGE', null, 750000)`,
    [version, planId, category, ids.maid, ids.cook],
  );
  await fx.q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [version]);

  return { cityId, north, south, communityId, southCommunityId, flats, southFlat, ids, category, windowId, version, planId };
}
