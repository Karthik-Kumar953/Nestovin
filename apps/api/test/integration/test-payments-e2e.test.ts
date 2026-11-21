import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { NON_REFUNDABLE_DISCLOSURE } from '@nestovin/contracts';
import { createApp } from '../../src/app';
import type { Database } from '../../src/db/database';
import type { AppDeps } from '../../src/http/context';
import { createTestPaymentProvider } from '../../src/integrations/razorpay';
import { BookingAdminService } from '../../src/modules/bookings/admin-service';
import { addDays } from '../../src/modules/bookings/pricing';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { WorkforceAdminService } from '../../src/modules/workforce/admin-service';
import { EmployeeService } from '../../src/modules/workforce/employee-service';
import { businessToday } from '../../src/lib/dates';
import { actor, fakeDeps } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable } from '../helpers/db';
import { Fixtures, commercialFixture, makeReadyTolerant, randomPhone } from '../helpers/qa-fixtures';

/*
 * Demo mode end to end (TEST_PAYMENTS_ENABLED): a resident books a continuous slot and
 * pays with the dev-only test provider; the admin sees the booking and payment, finds the
 * allocation need, confirms a standing worker, and the visits show in the admin visit list
 * and the worker's schedule. The demand-led initial payment and balance go the same way.
 * Everything runs through the HTTP routes except the worker schedule (service level).
 */

const available = await databaseAvailable();

describe.skipIf(!available)('demo mode: test payments end to end', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let fx: Fixtures;
  let f: Awaited<ReturnType<typeof commercialFixture>>;
  let http: ReturnType<typeof createApp>;
  let offHttp: ReturnType<typeof createApp>;
  let A: ResidentActor;
  let B: ResidentActor;
  let employeeId: string;
  let slotId: string;
  const root = actor({ id: randomUUID(), isSuperAdmin: true });
  const adminId = randomUUID();
  const today = businessToday();
  const tomorrow = addDays(today, 1);

  /** Resident tokens are "res:<userId>:<phone>" (fake verifier; the real one is Supabase phone OTP). */
  const withResidentTokens = (deps: AppDeps): AppDeps => ({
    ...deps,
    tokenVerifier: {
      async verify(token) {
        const [prefix, a, b] = token.split(':');
        if (prefix === 'res' && a && b) return { userId: a, aal: 'aal1', phone: b, email: undefined, sessionId: undefined };
        return deps.tokenVerifier.verify(token);
      },
    },
  });
  const res = (who: ResidentActor) => ({ Authorization: `Bearer res:${who.id}:${who.phone}` });
  const adm = { Authorization: `Bearer token:aal2:${adminId}` };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    fx = new Fixtures(admin);
    f = await commercialFixture(fx, db, actor({ id: randomUUID(), scope: { type: 'GLOBAL' } }), 2);
    A = await fx.resident({ flatId: f.flats[0]! });
    B = await fx.resident({ flatId: f.flats[1]! });

    const ops = new BookingAdminService(db);
    const slot = (await ops.createSlot(root, 'qa', f.communityId, { label: 'Cook 8:00', serviceId: f.ids.cook, startTime: '08:00', durationMinutes: 90, daysOfWeek: 127, capacity: 5 }))[0]!;
    await ops.updateSlot(root, 'qa', slot.id, { status: 'PUBLISHED', version: slot.version });
    slotId = slot.id;

    const hr = new WorkforceAdminService(db, fakeDeps({}).authAdmin);
    employeeId = (await hr.createEmployee(root, 'qa', { fullName: `QA Demo Worker ${fx.s}`, phone: randomPhone(), homeClusterId: f.north })).id;
    await hr.setQualifications(root, 'qa', employeeId, [f.ids.cook, f.ids.maid]);
    await makeReadyTolerant(hr, admin, root, employeeId);

    const admins = { [adminId]: { status: 'ACTIVE' as const, actor: actor({ id: adminId, isSuperAdmin: true }) } };
    const on = fakeDeps(admins, { TEST_PAYMENTS_ENABLED: 'true' });
    http = createApp(withResidentTokens({ ...on, db, payments: createTestPaymentProvider() }));
    const off = fakeDeps(admins);
    offHttp = createApp(withResidentTokens({ ...off, db }));
  });

  afterAll(async () => {
    await fx?.cleanup();
    await db?.destroy();
    await admin?.end();
  }, 180_000);

  it('test mode is advertised only when enabled; otherwise the route does not exist', async () => {
    expect((await request(http).get('/v1/resident/test-mode').set(res(A))).body).toEqual({ testPayments: true });
    expect((await request(offHttp).get('/v1/resident/test-mode').set(res(A))).body).toEqual({ testPayments: false });
    const missing = await request(offHttp).post('/v1/resident/payments/test-complete').set(res(A)).send({ paymentOrderId: randomUUID() });
    expect(missing.status).toBe(404);
  });

  let bookingId: string;
  let paymentOrderId: string;

  it('continuous booking -> test-complete confirms it through the normal verification path', async () => {
    const created = await request(http)
      .post('/v1/resident/bookings')
      .set(res(A))
      .set('Idempotency-Key', `qa-demo-${randomUUID()}`)
      .send({ slotId, selection: { planId: f.planId, serviceId: f.ids.cook, addonComponentIds: [] }, startDate: tomorrow });
    expect(created.status).toBe(201);
    bookingId = created.body.booking.id;
    paymentOrderId = created.body.checkout.paymentOrderId;
    expect(created.body.checkout).toMatchObject({ providerOrderId: expect.stringMatching(/^test_order_/), amountPaise: 500000 });

    // Another household cannot complete A's order (RLS: looks like it does not exist).
    const foreign = await request(http).post('/v1/resident/payments/test-complete').set(res(B)).send({ paymentOrderId });
    expect(foreign.status).toBe(404);

    const paid = await request(http).post('/v1/resident/payments/test-complete').set(res(A)).send({ paymentOrderId });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ orderStatus: 'PAID', message: expect.any(String) });
    // Repeating it is harmless.
    expect((await request(http).post('/v1/resident/payments/test-complete').set(res(A)).send({ paymentOrderId })).body.orderStatus).toBe('PAID');

    const mine = await request(http).get(`/v1/resident/bookings/${bookingId}`).set(res(A));
    expect(mine.body).toMatchObject({ status: 'CONFIRMED', subscription: { status: 'PENDING_ACTIVATION', periodStart: tomorrow } });

    const tx = await admin.query(`select provider_payment_id, amount_paise, verified_via from app.payment_transactions where order_id = $1`, [paymentOrderId]);
    expect(tx.rows).toHaveLength(1);
    expect(tx.rows[0]).toMatchObject({ provider_payment_id: expect.stringMatching(/^test_pay_/), verified_via: 'CHECKOUT' });
    const outbox = await admin.query(`select count(*)::int as n from app.notification_outbox where dedupe_key = $1`, [`paid:${paymentOrderId}`]);
    expect(outbox.rows[0].n).toBe(1);
    const audit = await admin.query(`select action from app.audit_events where target_id = $1 order by occurred_at`, [paymentOrderId]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['payment.verified', 'payment.test_completed']));
  });

  let componentId: string;

  it('the admin sees the booking, the payment and the allocation need', async () => {
    const bookings = await request(http).get(`/v1/admin/bookings?communityId=${f.communityId}`).set(adm);
    expect(bookings.status).toBe(200);
    expect(bookings.body.items.find((b: { id: string }) => b.id === bookingId)).toMatchObject({ status: 'CONFIRMED', mode: 'CONTINUOUS' });

    const pays = await request(http).get(`/v1/admin/payments?communityId=${f.communityId}`).set(adm);
    expect(pays.body.items.find((p: { id: string }) => p.id === paymentOrderId)).toMatchObject({
      status: 'PAID',
      purpose: 'FULL',
      transaction: { providerPaymentId: expect.stringMatching(/^test_pay_/), amountPaise: 500000 },
    });

    const needs = await request(http).get(`/v1/admin/allocation/needs?communityId=${f.communityId}&unassigned=true`).set(adm);
    const need = needs.body.items.find((n: { serviceId: string; periodStart: string }) => n.serviceId === f.ids.cook && n.periodStart === tomorrow);
    expect(need).toMatchObject({ startTime: '08:00', durationMinutes: 90, standing: null });
    componentId = need.componentId;
  });

  it('confirming a standing worker generates visits for the admin and the worker', async () => {
    const confirmed = await request(http).post(`/v1/admin/allocation/components/${componentId}/standing`).set(adm).send({ employeeId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.assignedVisits).toBeGreaterThanOrEqual(7);

    const to = addDays(tomorrow, 3);
    const visits = await request(http).get(`/v1/admin/visits?communityId=${f.communityId}&from=${tomorrow}&to=${to}`).set(adm);
    const ours = visits.body.items.filter((v: { assignment: { employeeId: string } | null }) => v.assignment?.employeeId === employeeId);
    expect(ours).toHaveLength(4);
    expect(ours[0]).toMatchObject({ scheduledDate: tomorrow, status: 'ASSIGNED', startsAt: expect.any(String) });

    const sched = await new EmployeeService(db).schedule({ id: employeeId, employeeCode: 'x', clusterId: f.north, mustChangePassword: false }, tomorrow, to);
    expect(sched).toHaveLength(4);
    expect(sched[0]).toMatchObject({ flat: { flatNumber: '101' } });

    const sub = await admin.query(`select s.status from app.subscriptions s where s.booking_id = $1`, [bookingId]);
    expect(sub.rows[0].status).toBe('ACTIVE');
  });

  it('demand-led: initial and balance payments complete the same way', async () => {
    const ops = new BookingAdminService(db);
    const cycle = await ops.createCycle(root, 'qa', f.communityId, {
      name: `QA demo ${fx.s}`,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      initialPct: 30,
      planIds: [f.planId],
    });
    await ops.publishCycle(root, 'qa', cycle.id, cycle.version);
    const created = await request(http)
      .post('/v1/resident/demand-requests')
      .set(res(B))
      .set('Idempotency-Key', `qa-demo-${randomUUID()}`)
      .send({
        cycleId: cycle.id,
        selection: { planId: f.planId, serviceId: f.ids.maid, addonComponentIds: [] },
        preferredWindowIds: [f.windowId],
        acceptNonRefundable: true,
        disclosureVersion: NON_REFUNDABLE_DISCLOSURE.version,
      });
    expect(created.status).toBe(201);
    const initial = await request(http).post('/v1/resident/payments/test-complete').set(res(B)).send({ paymentOrderId: created.body.checkout.paymentOrderId });
    expect(initial.body.orderStatus).toBe('PAID');
    const requests = await request(http).get('/v1/resident/demand-requests').set(res(B));
    expect(requests.body.items[0]).toMatchObject({ status: 'COMMITTED', initialPaidPaise: 90000 });
    const pays = await request(http).get(`/v1/admin/payments?communityId=${f.communityId}`).set(adm);
    expect(pays.body.items.find((p: { id: string }) => p.id === created.body.checkout.paymentOrderId)).toMatchObject({ status: 'PAID', purpose: 'INITIAL' });

    // Operations allocates and publishes; the balance is paid in test mode too.
    const set = await ops.createSlotSet(root, 'qa', cycle.id, { commencementDate: addDays(today, 10), balanceDueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const withSlot = await ops.addSetSlot(root, 'qa', set.id, { label: 'Maid 10:00', startTime: '10:00', durationMinutes: 60, daysOfWeek: 63, capacity: 2 });
    await ops.allocate(root, 'qa', set.id, { allocations: [{ requestId: created.body.request.id, slotId: withSlot.slots[0]!.id }] });
    await ops.publishSlotSet(root, 'qa', set.id, withSlot.version);
    const booking = (await request(http).get('/v1/resident/bookings').set(res(B))).body.items[0];
    expect(booking).toMatchObject({ mode: 'DEMAND_LED', status: 'PENDING_PAYMENT', outstandingPaise: 210000 });
    const checkout = await request(http).post(`/v1/resident/bookings/${booking.id}/pay`).set(res(B)).set('Idempotency-Key', `qa-demo-${randomUUID()}`);
    const balance = await request(http).post('/v1/resident/payments/test-complete').set(res(B)).send({ paymentOrderId: checkout.body.paymentOrderId });
    expect(balance.body.orderStatus).toBe('PAID');

    const adminBookings = await request(http).get(`/v1/admin/bookings?communityId=${f.communityId}`).set(adm);
    expect(adminBookings.body.items.find((b: { id: string }) => b.id === booking.id)).toMatchObject({ status: 'CONFIRMED', outstandingPaise: 0 });
    const needs = await request(http).get(`/v1/admin/allocation/needs?communityId=${f.communityId}&unassigned=true`).set(adm);
    expect(needs.body.items.some((n: { serviceId: string; periodStart: string }) => n.serviceId === f.ids.maid && n.periodStart === addDays(today, 10))).toBe(true);
  });
});
