import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger';
import { PaymentService } from '../../src/modules/bookings/payments';
import { AttendanceService } from '../../src/modules/attendance/service';
import { PayrollService } from '../../src/modules/payroll/service';
import { actor } from '../helpers/fake-deps';
import { FakeRazorpay, signedWebhook } from '../helpers/qa-fixtures';
import { scriptedDb, uniqueViolation, type Statement } from '../helpers/scripted-db';

/*
 * Architecture review findings (docs/reviews/2026-11-system-review.md on
 * claude/arch-review-b0d127), reproduced without touching any
 * database: PaymentService runs on a scripted in-memory driver that records
 * every statement. No money data is written anywhere.
 *
 * Each test asserts the FIXED behaviour and is kept as it.fails until the lead
 * fixes it (docs/testing/BUGS.md: BUG-QA-012…017).
 */

const silent = createLogger('silent', false);
const ORDER_ID = '0d4b8c1e-1f7e-4a4e-9a51-3f1c2b7d9e01';

/** Minimal provider_events table: event_id -> processed? */
function providerEventsTable() {
  const rows = new Map<string, { id: string; processed: boolean; valid: boolean }>();
  const respond = (q: Statement) => {
    if (q.sql.startsWith('insert into "app"."provider_events"')) {
      const eventId = String(q.params[0]);
      const valid = q.params[3] === true;
      const existing = rows.get(eventId);
      if (!existing) {
        const row = { id: `row-${eventId}`, processed: false, valid };
        rows.set(eventId, row);
        return [{ id: row.id, processed_at: null }];
      }
      // ON CONFLICT DO UPDATE ... WHERE processed_at IS NULL re-claims an unprocessed event.
      if (/on conflict .* do update/i.test(q.sql) && !existing.processed && existing.valid) return [{ id: existing.id, processed_at: null }];
      return [];
    }
    if (q.sql.startsWith('update "app"."provider_events"') && q.sql.includes('"processed_at"')) {
      for (const r of rows.values()) if (q.params.includes(r.id)) r.processed = true;
    }
    return undefined;
  };
  return { rows, respond };
}

describe('H-3 (BUG-QA-012): a webhook whose processing failed is retried, not acknowledged and dropped', () => {
  it.fails('the provider retry of a failed event is processed again (or the first answer is not 2xx)', async () => {
    const table = providerEventsTable();
    const { db } = scriptedDb(table.respond);
    const svc = new PaymentService(db, new FakeRazorpay(), silent);
    let attempts = 0;
    // A transient failure inside processing (e.g. a pool timeout during recordRefund).
    (svc as unknown as { processEvent: () => Promise<void> }).processEvent = async () => {
      attempts++;
      if (attempts === 1) throw new Error('connection terminated unexpectedly');
    };
    const wh = signedWebhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100 } } } });

    const first = await svc.handleWebhook(wh.raw, wh.signature, 'evt_h3');
    // Razorpay retries only on a non-2xx answer; the route maps 'ok' and 'duplicate' to 200.
    const providerWillRetry = first === 'rejected';
    const second = await svc.handleWebhook(wh.raw, wh.signature, 'evt_h3');

    expect(providerWillRetry || attempts === 2).toBe(true);
    expect(second).not.toBe('duplicate');
  });
});

describe('H-7 (BUG-QA-013): reconciliation rotates through open orders instead of re-polling the same 50', () => {
  it.fails('the open-order query is ordered and the checked orders are marked', async () => {
    const asked: string[] = [];
    const provider = new FakeRazorpay();
    provider.fetchOrderPayments = async (orderId: string) => {
      asked.push(orderId);
      return [];
    };
    const open = Array.from({ length: 50 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, provider_order_id: `order_${i}` }));
    const { db, log } = scriptedDb((q) => {
      if (q.sql.startsWith('select') && q.sql.includes('from "app"."payment_orders"') && q.sql.includes('"provider_order_id" is not null')) return open;
      return undefined;
    });
    const svc = new PaymentService(db, provider, silent);
    await svc.maintenance().catch(() => undefined); // only the reconciliation step matters here

    const reconcile = log.find((s) => s.sql.includes('from "app"."payment_orders"') && s.sql.includes('"provider_order_id" is not null'));
    expect(reconcile, 'reconciliation query was not issued').toBeTruthy();
    expect(asked).toHaveLength(50);
    // Without ORDER BY (and a last-checked marker) Postgres returns the same physical-first rows every minute.
    expect(reconcile!.sql).toMatch(/order by/i);
    expect(log.some((s) => s.sql.startsWith('update "app"."payment_orders"') && /last_checked/.test(s.sql))).toBe(true);
  });
});

describe('H-2 (BUG-QA-014): a verified payment is never rolled back when its business effect fails', () => {
  it.fails('a failing effect (e.g. the double-renewal unique index) keeps the evidence and goes to review', async () => {
    const order = {
      id: ORDER_ID,
      status: 'CREATED',
      currency: 'INR',
      amount_paise: '500000',
      purpose: 'BOOKING',
      ref_type: 'BOOKING',
      ref_id: '5c1f3c56-9a52-4c47-8c1f-0e6b4f0b2a10',
      resident_id: '7a0b2a4e-2b8f-4b1a-9a7c-2e5f8c3d1b20',
      cluster_id: null,
    };
    const { db, log } = scriptedDb((q) => {
      if (q.sql.startsWith('select') && q.sql.includes('from "app"."payment_orders"') && q.sql.includes('for update')) return [order];
      if (q.sql.startsWith('insert into "app"."payment_transactions"')) return [{ id: 'tx-1' }];
      return undefined;
    });
    const svc = new PaymentService(db, new FakeRazorpay(), silent);
    (svc as unknown as { applyPurpose: () => Promise<never> }).applyPurpose = async () => {
      throw uniqueViolation('subscriptions_one_renewal');
    };

    const result = await svc.settle(ORDER_ID, {
      payment: { id: 'pay_h2', orderId: 'order_h2', amountPaise: 500000, currency: 'INR', status: 'captured', method: 'upi' },
      via: 'WEBHOOK',
    });

    expect(result.orderStatus).toBe('REVIEW_REQUIRED');
    expect(log.some((s) => s.sql.startsWith('insert into "app"."payment_exceptions"'))).toBe(true);
    // The transaction that holds the payment_transactions row must commit, not roll back.
    const controls = log.filter((s) => /^(begin|commit|rollback)$/.test(s.sql)).map((s) => s.sql);
    expect(controls.at(-1)).toBe('commit');
  });
});

describe('M-17 (BUG-QA-015): check-in locks the ACTIVE assignment, not only the occurrence', () => {
  it.fails('the visit lookup locks every joined row it decides on (no "for update of o")', async () => {
    const { db, log } = scriptedDb(() => undefined); // no rows: the visit is "not found", which is fine here
    const att = new AttendanceService(db, 'test-pepper-0123456789');
    const worker = { id: '3b0e5f1a-8c2d-4e6f-9a1b-2c3d4e5f6a7b', employeeCode: 'NV-QA', clusterId: ORDER_ID, mustChangePassword: false };
    await att.checkIn(worker, ORDER_ID, { method: 'OTP', code: '123456', clientEventId: 'qa-m17-0001' }).catch(() => undefined);
    const lookup = log.find((s) => s.sql.includes('from "app"."service_occurrences" as "o"') && s.sql.includes('"app"."occurrence_assignments"'));
    expect(lookup, 'visit lookup was not issued').toBeTruthy();
    expect(lookup!.sql).toMatch(/for update/);
    // `for update of "o"` leaves the assignment row unlocked: a replacement committed meanwhile is not seen.
    expect(lookup!.sql).not.toMatch(/for update of "o"\s*$/);
  });
});

describe('M-2 race (BUG-QA-017): a payroll entry cannot slip into a run that was just submitted', () => {
  it.fails('addItem locks the payroll run (not only the line) before checking it is still DRAFT', async () => {
    const { db, log } = scriptedDb(() => undefined); // line not found: we only inspect the lock taken
    const payroll = new PayrollService(db);
    const root = actor({ isSuperAdmin: true, scope: { type: 'GLOBAL' } });
    await payroll.addItem(root, 'qa', ORDER_ID, { kind: 'EARNING', component: 'ALLOWANCE', amountPaise: 100, note: 'QA lock check' }).catch(() => undefined);
    const lookup = log.find((s) => s.sql.includes('from "app"."payroll_lines" as "l"') && s.sql.includes('"app"."payroll_runs"'));
    expect(lookup, 'line lookup was not issued').toBeTruthy();
    // `for update of "l"` reads r.status unlocked: submit can commit IN_REVIEW in between.
    expect(lookup!.sql).toMatch(/for (update|share)/);
    expect(lookup!.sql).not.toMatch(/for update of "l"\s*$/);
  });
});
