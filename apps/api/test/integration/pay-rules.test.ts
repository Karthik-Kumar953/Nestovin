import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { NON_REFUNDABLE_DISCLOSURE } from '@nestovin/contracts';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import { createLogger } from '../../src/lib/logger';
import { PaymentService } from '../../src/modules/bookings/payments';
import { ResidentBookingService } from '../../src/modules/bookings/resident-service';
import { BookingAdminService } from '../../src/modules/bookings/admin-service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { addDays } from '../../src/modules/bookings/pricing';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable } from '../helpers/db';
import { FakeRazorpay, Fixtures, capturedEvent, commercialFixture, signedWebhook } from '../helpers/qa-fixtures';

/*
 * PRD §PAY-01…16 (with ADR-013/015 overrides), one `it` per rule so the
 * coverage matrix in docs/testing/TEST_STRATEGY.md can point at each.
 * PAY-01…03 and the client-side half of PAY-04/08 are contract tests in
 * test/unit/pay-contracts.test.ts.
 */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('PAY rules (integration)', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let fx: Fixtures;
  let f: Awaited<ReturnType<typeof commercialFixture>>;
  const fake = new FakeRazorpay();
  let payments: PaymentService;
  let residents: ResidentBookingService;
  let ops: BookingAdminService;
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let R: ResidentActor[] = [];
  let cycle30: string;
  let cycle50: string;

  const demandInput = (cycleId: string) => ({
    cycleId,
    selection: { planId: f.planId, serviceId: f.ids.maid, addonComponentIds: [] },
    preferredWindowIds: [f.windowId],
    acceptNonRefundable: true as const,
    disclosureVersion: NON_REFUNDABLE_DISCLOSURE.version,
  });
  const requestOf = async (r: ResidentActor, id: string) => (await residents.demandRequests(r)).find((x) => x.id === id)!;
  const txCount = async (providerPaymentId: string) =>
    (await admin.query(`select count(*)::int n from app.payment_transactions where provider_payment_id = $1`, [providerPaymentId])).rows[0].n as number;

  async function publishedCycle(pct: number, name: string) {
    const c = await ops.createCycle(root, 'qa', f.communityId, {
      name: `${name} ${fx.s}`,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      initialPct: pct,
      planIds: [f.planId],
    });
    return (await ops.publishCycle(root, 'qa', c.id, c.version)).id;
  }

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    fx = new Fixtures(admin);
    f = await commercialFixture(fx, db, root, 8);
    payments = new PaymentService(db, fake, createLogger('silent', false));
    residents = new ResidentBookingService(db, payments);
    ops = new BookingAdminService(db);
    R = [];
    for (let i = 0; i < 8; i++) R.push(await fx.resident({ flatId: f.flats[i]! }));
    cycle30 = await publishedCycle(30, 'QA PAY 30');
  });

  afterAll(async () => {
    await fx?.cleanup();
    await db?.destroy();
    await admin?.end();
  });

  it('PAY-04: the server computes the percentage and amounts; client values are not used', async () => {
    // Extra keys a tampered client might send are not part of the service input at all;
    // the contract test shows Zod strips them. Here: the amounts come from the cycle + price.
    const tampered = { ...demandInput(cycle30), initialPct: 1, amountPaise: 100, totalPaise: 100 } as ReturnType<typeof demandInput>;
    const { request, checkout } = await residents.createDemandRequest(R[0]!, 'qa', tampered);
    expect(request).toMatchObject({ initialPct: 30, totalPaise: 300000, initialDuePaise: 90000, remainingDuePaise: 210000 });
    expect(checkout.amountPaise).toBe(90000);
  });

  it('PAY-05: the percentage cannot be edited after publication (API and database)', async () => {
    const c = await ops.getCycle(root, cycle30);
    await expectCode(ops.updateCycle(root, 'qa', cycle30, { initialPct: 40, version: c.version }), 'BUSINESS_RULE_VIOLATION');
    await expect(admin.query(`update app.demand_cycles set initial_pct = 40 where id = $1`, [cycle30])).rejects.toThrow();
    expect((await ops.getCycle(root, cycle30)).initialPct).toBe(30);
  });

  it('PAY-01/02/03 (database layer): 0, 100 and 101 are refused even if the API were bypassed', async () => {
    for (const pct of [0, 100, 101]) {
      await expect(
        admin.query(
          `insert into app.demand_cycles (community_id, name, opens_at, closes_at, initial_pct) values ($1, $2, now(), now() + interval '1 day', $3)`,
          [f.communityId, `QA bad ${pct} ${fx.s}`, pct],
        ),
      ).rejects.toThrow(/initial_pct_check/);
    }
  });

  it('PAY-06 / PAY-07: a new cycle uses its own percentage; existing commitments keep theirs', async () => {
    const before = (await residents.demandRequests(R[0]!))[0]!;
    cycle50 = await publishedCycle(50, 'QA PAY 50');
    const { request } = await residents.createDemandRequest(R[1]!, 'qa', demandInput(cycle50));
    expect(request).toMatchObject({ initialPct: 50, initialDuePaise: 150000, remainingDuePaise: 150000 });
    const after = await requestOf(R[0]!, before.id);
    expect(after).toMatchObject({ initialPct: 30, initialDuePaise: before.initialDuePaise, remainingDuePaise: before.remainingDuePaise, totalPaise: before.totalPaise });
  });

  it('PAY-08: without a provider-verified payment the request stays unpaid', async () => {
    const { request, checkout } = await residents.createDemandRequest(R[2]!, 'qa', demandInput(cycle30));
    // A client claiming success with a payment the provider never saw.
    await expect(residents.verifyPayment(R[2]!, { paymentOrderId: checkout.paymentOrderId, providerPaymentId: 'pay_fake', signature: 'x'.repeat(64) })).rejects.toThrow();
    // A real signature for a payment that is not captured yet (authorised only).
    const pending = fake.pay(checkout.providerOrderId, { status: 'authorized' });
    expect((await residents.verifyPayment(R[2]!, { paymentOrderId: checkout.paymentOrderId, ...pending })).orderStatus).toBe('CREATED');
    expect((await requestOf(R[2]!, request.id)).status).toBe('AWAITING_PAYMENT');
  });

  it('PAY-09: an invalid webhook signature is rejected and activates nothing', async () => {
    const { request, checkout } = await residents.createDemandRequest(R[3]!, 'qa', demandInput(cycle30));
    fake.pay(checkout.providerOrderId);
    const p = [...fake.payments.values()].find((x) => x.orderId === checkout.providerOrderId)!;
    const wh = signedWebhook(capturedEvent(p));
    expect(await payments.handleWebhook(wh.raw, 'deadbeef', `evt_${randomUUID()}`)).toBe('rejected');
    expect(await payments.handleWebhook(wh.raw, undefined, `evt_${randomUUID()}`)).toBe('rejected');
    expect(await txCount(p.id)).toBe(0);
    expect((await requestOf(R[3]!, request.id)).status).toBe('AWAITING_PAYMENT');
  });

  it('PAY-10: the same capture via checkout, webhook and webhook retries has one financial effect', async () => {
    const r = (await residents.demandRequests(R[3]!))[0]!;
    const checkout = await residents.payAgain(R[3]!, { type: 'DEMAND_REQUEST', id: r.id });
    const paid = fake.pay(checkout.providerOrderId);
    const p = fake.payments.get(paid.providerPaymentId)!;
    const wh = signedWebhook(capturedEvent(p));
    const eventId = `evt_${randomUUID()}`;
    expect(await payments.handleWebhook(wh.raw, wh.signature, eventId)).toBe('ok');
    expect(await payments.handleWebhook(wh.raw, wh.signature, eventId)).toBe('duplicate'); // provider retry
    expect(await payments.handleWebhook(wh.raw, wh.signature, `evt_${randomUUID()}`)).toBe('ok'); // order.paid for the same payment
    expect((await residents.verifyPayment(R[3]!, { paymentOrderId: checkout.paymentOrderId, ...paid })).orderStatus).toBe('PAID');
    expect(await txCount(p.id)).toBe(1);
    const after = await requestOf(R[3]!, r.id);
    expect(after).toMatchObject({ status: 'COMMITTED', initialPaidPaise: checkout.amountPaise });
    const audits = (await admin.query(`select count(*)::int n from app.audit_events where action = 'payment.verified' and target_id = $1`, [checkout.paymentOrderId])).rows[0].n;
    expect(audits).toBe(1);
  });

  // BUG-QA-003: an unsigned request with a chosen event id is stored first, so the
  // genuine signed event with the same id is then treated as a duplicate and dropped.
  it.fails('PAY-09/10: an unsigned event cannot pre-empt the genuine event with the same id (BUG-QA-003)', async () => {
    const { request, checkout } = await residents.createDemandRequest(R[4]!, 'qa', demandInput(cycle30));
    const paid = fake.pay(checkout.providerOrderId);
    const wh = signedWebhook(capturedEvent(fake.payments.get(paid.providerPaymentId)!));
    const eventId = `evt_${randomUUID()}`;
    expect(await payments.handleWebhook(wh.raw, 'forged', eventId)).toBe('rejected');
    expect(await payments.handleWebhook(wh.raw, wh.signature, eventId)).toBe('ok');
    expect((await requestOf(R[4]!, request.id)).status).toBe('COMMITTED');
  });

  it('PAY-11: currency mismatch goes to review and does not commit', async () => {
    const { request, checkout } = await residents.createDemandRequest(R[5]!, 'qa', demandInput(cycle30));
    const usd = fake.pay(checkout.providerOrderId, { currency: 'USD' });
    expect((await residents.verifyPayment(R[5]!, { paymentOrderId: checkout.paymentOrderId, ...usd })).orderStatus).toBe('REVIEW_REQUIRED');
    expect((await requestOf(R[5]!, request.id)).status).not.toBe('COMMITTED');
    const open = await ops.exceptions(root, 'OPEN');
    expect(open.some((e) => e.paymentOrderId === checkout.paymentOrderId && e.reasonCode === 'CURRENCY_MISMATCH')).toBe(true);
  });

  it('PAY-11: a payment for a different provider order is refused', async () => {
    const { checkout } = await residents.createDemandRequest(R[6]!, 'qa', demandInput(cycle30));
    const other = await fake.createOrder({ amountPaise: checkout.amountPaise });
    const stray = fake.pay(other.id);
    await expectCode(residents.verifyPayment(R[6]!, { paymentOrderId: checkout.paymentOrderId, ...stray }), 'BUSINESS_RULE_VIOLATION');
  });

  it('PAY-12: a payment and signature cannot be replayed against another resident’s order', async () => {
    // R[3] paid in PAY-10. R[6] tries to reuse that capture for their own order.
    const mine = (await residents.demandRequests(R[6]!))[0]!;
    const myCheckout = await residents.payAgain(R[6]!, { type: 'DEMAND_REQUEST', id: mine.id });
    const theirs = [...fake.payments.values()].find((p) => p.status === 'captured' && p.currency === 'INR')!;
    const theirSig = fake.pay(theirs.orderId!); // a genuine signature, but for their order
    await expectCode(residents.verifyPayment(R[6]!, { paymentOrderId: myCheckout.paymentOrderId, ...theirSig }), 'BUSINESS_RULE_VIOLATION');
    // And R[6] cannot settle R[3]'s order (RLS hides it).
    const r3 = (await residents.demandRequests(R[3]!))[0]!;
    const r3Order = (await admin.query(`select id from app.payment_orders where ref_id = $1 order by created_at limit 1`, [r3.id])).rows[0].id as string;
    await expectCode(residents.verifyPayment(R[6]!, { paymentOrderId: r3Order, ...theirSig }), 'NOT_FOUND');
    expect((await requestOf(R[6]!, mine.id)).status).toBe('AWAITING_PAYMENT');
  });

  it('PAY-13: a partial initial payment does not mark the commitment', async () => {
    const { request, checkout } = await residents.createDemandRequest(R[7]!, 'qa', demandInput(cycle30));
    const partial = fake.pay(checkout.providerOrderId, { amount: checkout.amountPaise - 100 });
    expect((await residents.verifyPayment(R[7]!, { paymentOrderId: checkout.paymentOrderId, ...partial })).orderStatus).toBe('REVIEW_REQUIRED');
    const r = await requestOf(R[7]!, request.id);
    expect(r.status).not.toBe('COMMITTED');
    expect(r.initialPaidPaise ?? 0).toBe(0);
  });

  let balanceBookingId: string;
  it('PAY-14: an unpaid demand-led balance never activates the subscription', async () => {
    // R[3] is COMMITTED in cycle30 (PAY-10). Publish a slot set for that request.
    const r3 = (await residents.demandRequests(R[3]!))[0]!;
    const set = await ops.createSlotSet(root, 'qa', cycle30, {
      commencementDate: addDays(new Date().toISOString().slice(0, 10), 10),
      balanceDueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    const withSlot = await ops.addSetSlot(root, 'qa', set.id, { label: 'QA 7:00', startTime: '07:00', durationMinutes: 60, daysOfWeek: 63, capacity: 5 });
    await ops.allocate(root, 'qa', set.id, { allocations: [{ requestId: r3.id, slotId: withSlot.slots[0]!.id }] });
    await ops.publishSlotSet(root, 'qa', set.id, withSlot.version);
    const [booking] = await residents.bookings(R[3]!);
    balanceBookingId = booking!.id;
    expect(booking).toMatchObject({ status: 'PENDING_PAYMENT', subscription: null });
    // Deadline passes with nothing paid: the balance expires, still no subscription.
    await admin.query(`update app.slot_sets set balance_due_at = now() - interval '1 minute' where id = $1`, [set.id]);
    await payments.maintenance();
    const [after] = await residents.bookings(R[3]!);
    expect(after!.status).not.toBe('CONFIRMED');
    expect(after!.subscription).toBeNull();
    expect((await admin.query(`select count(*)::int n from app.subscriptions where booking_id = $1`, [balanceBookingId])).rows[0].n).toBe(0);
  });

  it('PAY-15: a continuous booking is not confirmed until the payment is captured and verified', async () => {
    const slots = await ops.createSlot(root, 'qa', f.communityId, { label: `QA Cook ${fx.s}`, serviceId: f.ids.cook, startTime: '08:00', durationMinutes: 90, daysOfWeek: 127, capacity: 3 });
    await ops.updateSlot(root, 'qa', slots[0]!.id, { status: 'PUBLISHED', version: slots[0]!.version });
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
    const b = await residents.createBooking(R[5]!, 'qa', { slotId: slots[0]!.id, selection: { planId: f.planId, serviceId: f.ids.cook, addonComponentIds: [] }, startDate: tomorrow });
    expect(b.checkout.amountPaise).toBe(500000); // continuous = 100%
    const authorised = fake.pay(b.checkout.providerOrderId, { status: 'authorized' });
    expect((await residents.verifyPayment(R[5]!, { paymentOrderId: b.checkout.paymentOrderId, ...authorised })).orderStatus).toBe('CREATED');
    expect((await residents.bookings(R[5]!)).find((x) => x.id === b.booking.id)!.status).toBe('PENDING_PAYMENT');
    const captured = fake.pay(b.checkout.providerOrderId);
    expect((await residents.verifyPayment(R[5]!, { paymentOrderId: b.checkout.paymentOrderId, ...captured })).orderStatus).toBe('PAID');
    expect((await residents.bookings(R[5]!)).find((x) => x.id === b.booking.id)!.status).toBe('CONFIRMED');
  });

  it('PAY-16: a refund is a separate record with an audit event; the original transaction is preserved', async () => {
    const tx = (await admin.query(`select t.id, t.amount_paise from app.payment_transactions t join app.payment_orders o on o.id = t.order_id where o.resident_id = $1 and t.status = 'CAPTURED' limit 1`, [R[5]!.id])).rows[0] as { id: string; amount_paise: string };
    const refund = await ops.approveRefund(root, 'qa-req', tx.id, { amountPaise: 1000, reason: 'QA goodwill adjustment' });
    const after = (await admin.query(`select amount_paise from app.payment_transactions where id = $1`, [tx.id])).rows[0];
    expect(after.amount_paise).toBe(tx.amount_paise);
    const rec = (await admin.query(`select amount_paise::int a, reason, approved_by from app.refund_records where id = $1`, [refund.refundId])).rows[0];
    expect(rec).toMatchObject({ a: 1000, reason: 'QA goodwill adjustment', approved_by: root.id });
    const audit = (await admin.query(`select actor_id, reason from app.audit_events where action = 'refund.approved' and target_id = $1`, [tx.id])).rows;
    expect(audit).toEqual([{ actor_id: root.id, reason: 'QA goodwill adjustment' }]);
    await expect(admin.query(`delete from app.payment_transactions where id = $1`, [tx.id])).rejects.toThrow(/append-only/);
    await expectCode(ops.approveRefund(root, 'qa', tx.id, { amountPaise: Number(tx.amount_paise), reason: 'Too much' }), 'BUSINESS_RULE_VIOLATION');
  });

  it('jobs: payment maintenance can be rerun safely (no double effects)', async () => {
    const snapshot = async () =>
      (
        await admin.query(
          `select (select count(*)::int from app.payment_transactions t join app.payment_orders o on o.id = t.order_id where o.community_id = $1) tx,
                  (select count(*)::int from app.subscriptions s join app.bookings b on b.id = s.booking_id where b.community_id = $1) subs,
                  (select string_agg(status, ',' order by id) from app.bookings where community_id = $1) bookings,
                  (select string_agg(status, ',' order by id) from app.demand_requests where community_id = $1) requests`,
          [f.communityId],
        )
      ).rows[0];
    await payments.maintenance();
    const first = await snapshot();
    await payments.maintenance();
    await payments.maintenance();
    expect(await snapshot()).toEqual(first);
  });
});
