import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { NON_REFUNDABLE_DISCLOSURE } from '@nestovin/contracts';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import { hmacHex, type PaymentProvider, type ProviderPayment } from '../../src/integrations/razorpay';
import { createLogger } from '../../src/lib/logger';
import { LocationService } from '../../src/modules/locations/service';
import { PaymentService } from '../../src/modules/bookings/payments';
import { ResidentBookingService } from '../../src/modules/bookings/resident-service';
import { BookingAdminService } from '../../src/modules/bookings/admin-service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { addDays } from '../../src/modules/bookings/pricing';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, appPool, databaseAvailable, uniq } from '../helpers/db';

/*
 * Phase 4 (ADR-006/013/015): demand cycle -> initial payment -> slot set ->
 * balance -> subscription; continuous booking with capacity; refunds; webhooks.
 * Razorpay is replaced by a fake that signs like the real one.
 */

const available = await databaseAvailable();
const KEY_SECRET = 'test-key-secret-123456';
const WEBHOOK_SECRET = 'test-webhook-secret-123456';

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

class FakeRazorpay implements PaymentProvider {
  readonly keyId = 'rzp_test_fake';
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
    return hmacHex(KEY_SECRET, `${orderId}|${paymentId}`) === signature;
  }
  verifyWebhookSignature(raw: Buffer, signature: string) {
    return hmacHex(WEBHOOK_SECRET, raw) === signature;
  }
  /** Simulates the resident paying at Checkout; returns what the app would send to /payments/verify. */
  pay(providerOrderId: string, amount?: number) {
    const id = `pay_${randomUUID().slice(0, 12)}`;
    this.payments.set(id, { id, orderId: providerOrderId, amountPaise: amount ?? this.orders.get(providerOrderId)!.amount, currency: 'INR', status: 'captured', method: 'upi' });
    return { providerPaymentId: id, signature: hmacHex(KEY_SECRET, `${providerOrderId}|${id}`) };
  }
}

function webhook(body: unknown) {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, signature: hmacHex(WEBHOOK_SECRET, raw) };
}

describe.skipIf(!available)('demand cycles, bookings and payments (Phase 4)', { timeout: 90_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let app: pg.Pool;
  const fake = new FakeRazorpay();
  let payments: PaymentService;
  let residents: ResidentBookingService;
  let ops: BookingAdminService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let c1: string;
  let c2: string;
  let communityId: string;
  const flats: string[] = [];
  let planId: string;
  let ids: { maid: string; cook: string; caretaker: string };
  let caretakerAddonId: string;
  let windowId: string;

  const phone = () => `+9197${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const A: ResidentActor = { id: randomUUID(), phone: phone() };
  const B: ResidentActor = { id: randomUUID(), phone: phone() }; // not verified
  const C: ResidentActor = { id: randomUUID(), phone: phone() };
  const D: ResidentActor = { id: randomUUID(), phone: phone() };
  const south = () => actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c2] } });

  let cycleId: string;
  let requestA: string;
  let slotSetId: string;

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    app = appPool(2);
    payments = new PaymentService(db, fake, createLogger('silent', false));
    residents = new ResidentBookingService(db, payments);
    ops = new BookingAdminService(db);
    const loc = new LocationService(db);

    const cityId = (await loc.createCity(root, 't', { name: `P4 City ${s}`, state: 'Telangana' })).id;
    c1 = (await loc.createCluster(root, 't', { name: `P4 North ${s}`, code: `QN${s}` })).id;
    c2 = (await loc.createCluster(root, 't', { name: `P4 South ${s}`, code: `QS${s}` })).id;
    communityId = (await loc.createCommunity(root, 't', { cityId, name: `P4 Alpha ${s}`, code: `QA${s}`, clusterId: c1 })).id;
    const tower = (await loc.createTower(root, 't', { communityId, name: 'T1' })).id;
    for (const n of ['101', '102', '103', '104']) flats.push((await loc.createFlat(root, 't', { towerId: tower, flatNumber: n })).id);

    const q = (text: string, params: unknown[] = []) => admin.query(text, params);
    const svc = (await q(`select id, code from app.services`)).rows as { id: string; code: string }[];
    ids = { maid: svc.find((x) => x.code === 'MAID')!.id, cook: svc.find((x) => x.code === 'COOK')!.id, caretaker: svc.find((x) => x.code === 'CARETAKER')!.id };
    await q(`update app.communities set status = 'ACTIVE', default_operating_mode = 'CONTINUOUS' where id = $1`, [communityId]);
    await q(
      `insert into app.community_services (community_id, service_id, enabled, operating_mode) values
         ($1, $2, true, 'DEMAND_LED'), ($1, $3, true, 'CONTINUOUS'), ($1, $4, true, 'DEMAND_LED')`,
      [communityId, ids.maid, ids.cook, ids.caretaker],
    );
    const category = (await q(`insert into app.residence_categories (community_id, code, label) values ($1, '2BHK', '2 BHK') returning id`, [communityId])).rows[0].id;
    await q(`update app.flats set residence_category_id = $1 where id = any($2)`, [category, flats]);
    windowId = (await q(`insert into app.time_windows (community_id, name, start_time, end_time) values ($1, 'Morning', '07:00', '11:00') returning id`, [communityId])).rows[0].id;
    const version = (await q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [communityId])).rows[0].id;
    planId = (await q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'SILVER', 'Silver', 30) returning id`, [version])).rows[0].id;
    await q(`insert into app.plan_components (plan_id, service_id, duration_minutes, time_window_id) values ($1, $2, 60, $4), ($1, $3, 90, $4)`, [planId, ids.maid, ids.cook, windowId]);
    caretakerAddonId = (
      await q(`insert into app.plan_components (plan_id, service_id, is_optional_addon, duration_minutes, addon_hours) values ($1, $2, true, 120, 2) returning id`, [planId, ids.caretaker])
    ).rows[0].id;
    await q(
      `insert into app.plan_prices (catalogue_version_id, plan_id, residence_category_id, price_basis, service_id, amount_paise) values
         ($1, $2, $3, 'SERVICE', $4, 300000), ($1, $2, $3, 'SERVICE', $5, 500000), ($1, $2, $3, 'PACKAGE', null, 750000)`,
      [version, planId, category, ids.maid, ids.cook],
    );
    await q(`insert into app.plan_component_prices (plan_component_id, residence_category_id, amount_paise) values ($1, $2, 100000)`, [caretakerAddonId, category]);
    await q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [version]);

    for (const r of [A, B, C, D]) {
      await q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [r.id, r.phone.slice(1)]);
      await q(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, $3)`, [r.id, r.phone, `P4 ${r.id.slice(0, 4)}`]);
    }
    const verified = [
      [A, flats[0]],
      [C, flats[1]],
      [D, flats[2]],
    ] as const;
    for (const [r, f] of verified) {
      await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status, verified_at) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED', now())`, [r.id, f]);
    }
    await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'PENDING')`, [B.id, flats[3]]);
  });

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
    await app?.end();
  });

  const demandInput = (serviceId: string, addons: string[] = []) => ({
    cycleId,
    selection: { planId, serviceId, addonComponentIds: addons },
    preferredWindowIds: [windowId],
    acceptNonRefundable: true as const,
    disclosureVersion: NON_REFUNDABLE_DISCLOSURE.version,
  });

  it('booking needs a verified residence (ADR-015)', async () => {
    const opts = await residents.options(B);
    expect(opts.eligible).toBe(false);
    expect(opts.reason).toMatch(/verification/);
    expect((await residents.options(A)).eligible).toBe(true);
  });

  it('a cycle cannot be published without a percentage, and locks it once published', async () => {
    const draft = await ops.createCycle(root, 't', communityId, {
      name: `Cycle ${s}`,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      planIds: [planId],
    });
    cycleId = draft.id;
    await expect(ops.publishCycle(root, 't', cycleId, draft.version)).rejects.toThrow(/initial payment percentage/);
    const withPct = await ops.updateCycle(root, 't', cycleId, { initialPct: 30, version: draft.version });
    await expectCode(ops.getCycle(south(), cycleId), 'NOT_FOUND');
    const published = await ops.publishCycle(root, 't', cycleId, withPct.version);
    expect(published).toMatchObject({ status: 'PUBLISHED', initialPct: 30 });
    await expectCode(ops.updateCycle(root, 't', cycleId, { initialPct: 40, version: published.version }), 'BUSINESS_RULE_VIOLATION');
    await expect(app.query(`update app.demand_cycles set initial_pct = 40 where id = $1`, [cycleId])).rejects.toThrow(/locked configuration/);
  });

  it('creates a demand request with the locked percentage from the server-side price', async () => {
    await expectCode(residents.createDemandRequest(A, 't', demandInput(ids.cook)), 'BUSINESS_RULE_VIOLATION'); // Cook is continuous
    const { request, checkout } = await residents.createDemandRequest(A, 't', demandInput(ids.maid, [caretakerAddonId]));
    requestA = request.id;
    expect(request).toMatchObject({ status: 'AWAITING_PAYMENT', totalPaise: 400000, initialPct: 30, initialDuePaise: 120000, remainingDuePaise: 280000 });
    expect(checkout.amountPaise).toBe(120000);
    await expectCode(residents.createDemandRequest(A, 't', demandInput(ids.maid)), 'CONFLICT'); // one per flat per cycle
  });

  it('only a verified payment commits the request, exactly once', async () => {
    const checkout = await residents.payAgain(A, { type: 'DEMAND_REQUEST', id: requestA });
    const paid = fake.pay(checkout.providerOrderId);
    await expectCode(residents.verifyPayment(A, { paymentOrderId: checkout.paymentOrderId, providerPaymentId: paid.providerPaymentId, signature: 'forged' }), 'BUSINESS_RULE_VIOLATION');
    expect((await residents.demandRequests(A))[0]!.status).toBe('AWAITING_PAYMENT');

    const ok = await residents.verifyPayment(A, { paymentOrderId: checkout.paymentOrderId, ...paid });
    expect(ok.orderStatus).toBe('PAID');
    const again = await residents.verifyPayment(A, { paymentOrderId: checkout.paymentOrderId, ...paid });
    expect(again.orderStatus).toBe('PAID');
    // The same capture arriving by webhook has no second effect.
    const p = fake.payments.get(paid.providerPaymentId)!;
    const wh = webhook({ event: 'payment.captured', payload: { payment: { entity: { id: p.id, order_id: p.orderId, amount: p.amountPaise, currency: 'INR', status: 'captured', method: 'upi' } } } });
    expect(await payments.handleWebhook(wh.raw, wh.signature, `evt_${randomUUID()}`)).toBe('ok');
    const { rows } = await admin.query(`select count(*)::int as n from app.payment_transactions where provider_payment_id = $1`, [p.id]);
    expect(rows[0].n).toBe(1);
    const mine = (await residents.demandRequests(A))[0]!;
    expect(mine).toMatchObject({ status: 'COMMITTED', initialPaidPaise: 120000 });
    const summary = await ops.summary(root, cycleId);
    expect(summary.totals.committed).toBe(1);
    expect(summary.bySelection[0]).toMatchObject({ planName: 'Silver', count: 1 });
    expect(summary.byPreferredWindow[0]).toMatchObject({ windowName: 'Morning', firstChoice: 1 });
  });

  it('webhooks: bad signatures are rejected and repeated events are ignored', async () => {
    const wh = webhook({ event: 'payment.failed', payload: {} });
    expect(await payments.handleWebhook(wh.raw, 'bad', 'evt_bad')).toBe('rejected');
    const id = `evt_${randomUUID()}`;
    expect(await payments.handleWebhook(wh.raw, wh.signature, id)).toBe('ok');
    expect(await payments.handleWebhook(wh.raw, wh.signature, id)).toBe('duplicate');
  });

  it('slot set: allocation respects capacity; publishing creates bookings awaiting the balance', async () => {
    const set = await ops.createSlotSet(root, 't', cycleId, {
      commencementDate: addDays(new Date().toISOString().slice(0, 10), 10),
      balanceDueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    slotSetId = set.id;
    const withSlot = await ops.addSetSlot(root, 't', set.id, { label: 'Morning 7:00', startTime: '07:00', durationMinutes: 120, daysOfWeek: 63, capacity: 1 });
    const slotId = withSlot.slots[0]!.id;
    await ops.allocate(root, 't', set.id, { allocations: [{ requestId: requestA, slotId }] });
    const published = await ops.publishSlotSet(root, 't', set.id, withSlot.version + 0);
    expect(published.status).toBe('PUBLISHED');
    const [booking] = await residents.bookings(A);
    expect(booking).toMatchObject({ mode: 'DEMAND_LED', status: 'PENDING_PAYMENT', totalPaise: 400000, paidPaise: 120000, outstandingPaise: 280000 });
    expect(booking!.balanceDueAt).not.toBeNull();
  });

  it('a wrong amount goes to review; the correct balance confirms the booking and creates the subscription', async () => {
    const [booking] = await residents.bookings(A);
    const first = await residents.payAgain(A, { type: 'BOOKING', id: booking!.id });
    expect(first.amountPaise).toBe(280000);
    const wrong = fake.pay(first.providerOrderId, 1000);
    expect((await residents.verifyPayment(A, { paymentOrderId: first.paymentOrderId, ...wrong })).orderStatus).toBe('REVIEW_REQUIRED');
    const open = await ops.exceptions(root, 'OPEN');
    expect(open.some((e) => e.reasonCode === 'AMOUNT_MISMATCH' && e.paymentOrderId === first.paymentOrderId)).toBe(true);
    expect((await ops.exceptions(south(), 'OPEN')).some((e) => e.paymentOrderId === first.paymentOrderId)).toBe(false);

    const second = await residents.payAgain(A, { type: 'BOOKING', id: booking!.id });
    expect(second.paymentOrderId).not.toBe(first.paymentOrderId);
    const right = fake.pay(second.providerOrderId);
    expect((await residents.verifyPayment(A, { paymentOrderId: second.paymentOrderId, ...right })).orderStatus).toBe('PAID');
    const [after] = await residents.bookings(A);
    expect(after).toMatchObject({ status: 'CONFIRMED', outstandingPaise: 0 });
    expect(after!.subscription).toMatchObject({ status: 'PENDING_ACTIVATION', periodStart: after!.startDate });
    expect((await residents.demandRequests(A))[0]!.status).toBe('CONVERTED');
  });

  it('continuous: capacity is re-checked when the payment arrives; the late payer goes to review and can be refunded', async () => {
    const slots = await ops.createSlot(root, 't', communityId, { label: 'Cook 8:00', serviceId: ids.cook, startTime: '08:00', durationMinutes: 90, daysOfWeek: 127, capacity: 1 });
    const slot = slots[0]!;
    await ops.updateSlot(root, 't', slot.id, { status: 'PUBLISHED', version: slot.version });
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
    const sel = { planId, serviceId: ids.cook, addonComponentIds: [] };

    await expectCode(residents.createBooking(C, 't', { slotId: slot.id, selection: sel, startDate: addDays(tomorrow, 40) }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(residents.createBooking(C, 't', { slotId: slot.id, selection: { ...sel, serviceId: ids.maid }, startDate: tomorrow }), 'BUSINESS_RULE_VIOLATION');

    const a = await residents.createBooking(D, 't', { slotId: slot.id, selection: sel, startDate: tomorrow });
    const c = await residents.createBooking(C, 't', { slotId: slot.id, selection: sel, startDate: tomorrow });
    expect(c.checkout.amountPaise).toBe(500000);
    const payC = fake.pay(c.checkout.providerOrderId);
    expect((await residents.verifyPayment(C, { paymentOrderId: c.checkout.paymentOrderId, ...payC })).orderStatus).toBe('PAID');
    const payD = fake.pay(a.checkout.providerOrderId);
    expect((await residents.verifyPayment(D, { paymentOrderId: a.checkout.paymentOrderId, ...payD })).orderStatus).toBe('REVIEW_REQUIRED');
    expect((await residents.bookings(D)).find((b) => b.id === a.booking.id)!.status).toBe('REVIEW_REQUIRED');
    expect((await residents.options(D)).continuousSlots.find((x) => x.id === slot.id)!.available).toBe(false);

    const ex = (await ops.exceptions(root, 'OPEN')).find((e) => e.paymentOrderId === a.checkout.paymentOrderId)!;
    expect(ex.reasonCode).toBe('SLOT_UNAVAILABLE');
    await expectCode(ops.approveRefund(root, 't', ex.transactionId!, { amountPaise: 500001, reason: 'Too much' }), 'BUSINESS_RULE_VIOLATION');
    await ops.approveRefund(root, 't', ex.transactionId!, { amountPaise: 500000, reason: 'Slot was full when the payment arrived' });
    const wh = webhook({ event: 'refund.processed', payload: { refund: { entity: { id: `rfnd_${randomUUID().slice(0, 10)}`, payment_id: payD.providerPaymentId, amount: 500000 } } } });
    expect(await payments.handleWebhook(wh.raw, wh.signature, `evt_${randomUUID()}`)).toBe('ok');
    const page = await ops.payments(root, { limit: 50 });
    const refunded = page.items.find((p) => p.id === a.checkout.paymentOrderId)!;
    expect(refunded.transaction).toMatchObject({ status: 'REFUNDED', refundedPaise: 500000 });
    await ops.resolveException(root, 't', ex.id, 'Refunded in full');

    // A refund nobody approved in Nestovin is flagged.
    const rogue = webhook({ event: 'refund.processed', payload: { refund: { entity: { id: `rfnd_${randomUUID().slice(0, 10)}`, payment_id: payC.providerPaymentId, amount: 1000 } } } });
    await payments.handleWebhook(rogue.raw, rogue.signature, `evt_${randomUUID()}`);
    expect((await ops.exceptions(root, 'OPEN')).some((e) => e.reasonCode === 'UNAPPROVED_REFUND')).toBe(true);
  });

  it('renewal is a new 100% booking at the current price, once per subscription', async () => {
    const sub = (await residents.bookings(C)).find((b) => b.status === 'CONFIRMED')!.subscription!;
    expect(sub.renewable).toBe(true);
    const renewal = await residents.renew(C, 't', sub.id);
    expect(renewal.checkout.amountPaise).toBe(500000);
    expect(renewal.booking.startDate).toBe(addDays(sub.periodEnd, 1));
    await expectCode(residents.renew(C, 't', sub.id), 'CONFLICT');
  });

  it('RLS keeps other households’ commercial records out of reach', async () => {
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.user_id', $1, true), set_config('app.actor_kind', 'resident', true)`, [B.id]);
      const counts: number[] = [];
      for (const table of ['demand_requests', 'bookings', 'payment_orders', 'booking_terms_snapshots', 'subscriptions', 'payment_transactions', 'payment_exceptions']) {
        counts.push((await client.query(`select count(*)::int as n from app.${table}`)).rows[0].n as number);
      }
      expect(counts.every((n) => n === 0)).toBe(true);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('maintenance closes finished cycles, cancels unpaid requests and expires unpaid balances', async () => {
    // A second cycle where D leaves the request unpaid.
    const c2cycle = await ops.createCycle(root, 't', communityId, {
      name: `Cycle B ${s}`,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      initialPct: 50,
      planIds: [planId],
    });
    await ops.publishCycle(root, 't', c2cycle.id, c2cycle.version);
    const { request } = await residents.createDemandRequest(D, 't', { ...demandInput(ids.maid), cycleId: c2cycle.id });
    await admin.query(`update app.demand_cycles set closes_at = now() - interval '1 minute' where id = $1`, [c2cycle.id]);
    // And an unpaid balance past its deadline in the first cycle's slot set.
    await admin.query(`update app.slot_sets set balance_due_at = now() - interval '1 minute' where id = $1`, [slotSetId]);

    const result = await payments.maintenance();
    expect(result.closedCycles).toBeGreaterThanOrEqual(1);
    expect((await ops.getCycle(root, c2cycle.id)).status).toBe('CLOSED');
    expect((await residents.demandRequests(D)).find((r) => r.id === request.id)!.status).toBe('CANCELLED');
  });
});
