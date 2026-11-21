import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Checkout, PaymentResult } from '@nestovin/contracts';
import type { Database, DbClaims, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import type { PaymentExceptionReason, PaymentPurpose } from '../../db/schema';
import { toProviderPayment, type PaymentProvider, type ProviderPayment } from '../../integrations/razorpay';
import type { AppError} from '../../lib/errors';
import { businessRule, notFound } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { auditSystem } from '../audit/audit';
import { addDays } from './pricing';
import { notify } from '../notifications/service';
import { businessToday } from '../../lib/dates';

export const SYSTEM_CLAIMS: DbClaims = { userId: null, actorKind: 'system', isSuperAdmin: false, clusterIds: 'all' };

export function paymentsUnavailable(): AppError {
  return businessRule('Online payments are not available right now. Please try again later.');
}

type Verified = { payment: ProviderPayment; via: 'CHECKOUT' | 'WEBHOOK' | 'RECONCILIATION' };

/**
 * Households currently holding a slot (ADR-013 capacity). Counted by a SECURITY
 * DEFINER function so the number is right under any caller's RLS view.
 */
export async function slotUsage(trx: Tx, slotId: string, _mode?: 'CONTINUOUS' | 'DEMAND_LED', excludeSubscriptionId?: string | null) {
  const { rows } = await sql<{ n: number }>`select app.slot_usage(${slotId}, ${excludeSubscriptionId ?? null}::uuid) as n`.execute(trx);
  return Number(rows[0]?.n ?? 0);
}

/**
 * RES-08 / ADR-006. Orders are created from server-side amounts only; business
 * state changes only in `settle`, after the provider payment is verified, in one
 * transaction, idempotently (unique provider_payment_id).
 */
export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly provider: PaymentProvider | null,
    private readonly logger: Logger,
  ) {}

  /** Creates (or reuses an open) provider order for a record. Runs inside the caller's transaction. */
  async orderFor(
    trx: Tx,
    args: {
      purpose: PaymentPurpose;
      refType: 'DEMAND_REQUEST' | 'BOOKING';
      refId: string;
      residentId: string;
      flatId: string;
      communityId: string;
      clusterId: string | null;
      amountPaise: number;
      description: string;
      idempotencyKey?: string | undefined;
    },
  ): Promise<Checkout> {
    if (!this.provider) throw paymentsUnavailable();
    const open = await trx
      .selectFrom('app.payment_orders')
      .selectAll()
      .where('ref_type', '=', args.refType)
      .where('ref_id', '=', args.refId)
      .where('purpose', '=', args.purpose)
      .where('status', '=', 'CREATED')
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (open && Number(open.amount_paise) === args.amountPaise && open.provider_order_id) {
      return this.checkout(open.id, open.provider_order_id, args.amountPaise, open.currency, args.description);
    }
    const ttl = await setting(trx, 'payment_order_ttl_minutes', 30);
    const row = await trx
      .insertInto('app.payment_orders')
      .values({
        purpose: args.purpose,
        ref_type: args.refType,
        ref_id: args.refId,
        resident_id: args.residentId,
        flat_id: args.flatId,
        community_id: args.communityId,
        cluster_id: args.clusterId,
        amount_paise: args.amountPaise,
        idempotency_key: args.idempotencyKey ?? randomUUID(),
        expires_at: new Date(Date.now() + ttl * 60_000),
      })
      .returning(['id', 'currency'])
      .executeTakeFirstOrThrow()
      .catch((err: unknown) => {
        if ((err as { code?: string }).code === '23505') throw businessRule('This payment request was already submitted. Refresh and try again.');
        throw err;
      });
    let providerOrder: { id: string };
    try {
      providerOrder = await this.provider.createOrder({
        amountPaise: args.amountPaise,
        currency: row.currency,
        receipt: row.id,
        notes: { purpose: args.purpose, ref_type: args.refType, ref_id: args.refId },
      });
    } catch (err) {
      this.logger.error({ err, orderId: row.id }, 'razorpay order creation failed');
      throw businessRule('Could not start the payment. Nothing was charged. Please try again.');
    }
    await trx.updateTable('app.payment_orders').set({ provider_order_id: providerOrder.id }).where('id', '=', row.id).execute();
    return this.checkout(row.id, providerOrder.id, args.amountPaise, row.currency, args.description);
  }

  private checkout(id: string, providerOrderId: string, amountPaise: number, currency: string, description: string): Checkout {
    return { paymentOrderId: id, providerOrderId, keyId: this.provider!.keyId, amountPaise, currency, description };
  }

  /** Checkout callback: signature + server-side fetch, then settle. Never trusts the client alone. */
  async verifyCheckout(residentClaims: DbClaims, input: { paymentOrderId: string; providerPaymentId: string; signature: string }): Promise<PaymentResult> {
    if (!this.provider) throw paymentsUnavailable();
    const order = await withTx(this.db, residentClaims, (trx) =>
      trx.selectFrom('app.payment_orders').select(['id', 'provider_order_id', 'status']).where('id', '=', input.paymentOrderId).executeTakeFirst(),
    );
    if (!order || !order.provider_order_id) throw notFound('Payment');
    if (!this.provider.verifyCheckoutSignature(order.provider_order_id, input.providerPaymentId, input.signature)) {
      throw businessRule('We could not verify this payment. If money was deducted, it will be reconciled automatically.');
    }
    const payment = await this.provider.fetchPayment(input.providerPaymentId);
    if (payment.orderId !== order.provider_order_id) {
      throw businessRule('We could not verify this payment. If money was deducted, it will be reconciled automatically.');
    }
    return this.settle(order.id, { payment, via: 'CHECKOUT' });
  }

  /**
   * Applies a verified provider payment. Idempotent: the same provider payment is
   * recorded once and has at most one business effect.
   */
  async settle(orderId: string, v: Verified): Promise<PaymentResult> {
    const { payment } = v;
    if (payment.status !== 'captured') {
      return { orderStatus: 'CREATED', message: 'Payment is still being processed. We will update you once it is confirmed.' };
    }
    return withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
      const order = await trx.selectFrom('app.payment_orders').selectAll().where('id', '=', orderId).forUpdate().executeTakeFirst();
      if (!order) throw notFound('Payment');
      const seen = await trx.selectFrom('app.payment_transactions').select('id').where('provider_payment_id', '=', payment.id).executeTakeFirst();
      if (seen) return result(order.status);

      const tx = await trx
        .insertInto('app.payment_transactions')
        .values({
          order_id: order.id,
          resident_id: order.resident_id,
          cluster_id: order.cluster_id,
          provider_payment_id: payment.id,
          amount_paise: payment.amountPaise,
          currency: payment.currency,
          method: payment.method,
          status: 'CAPTURED',
          verified_via: v.via,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const review = async (reason: PaymentExceptionReason, detail: string, markOrder = true) => {
        if (markOrder) await trx.updateTable('app.payment_orders').set({ status: 'REVIEW_REQUIRED' }).where('id', '=', order.id).execute();
        await trx
          .insertInto('app.payment_exceptions')
          .values({ order_id: order.id, transaction_id: tx.id, cluster_id: order.cluster_id, reason_code: reason, detail })
          .execute();
        await auditSystem(trx, 'system', null, { action: 'payment.review_required', targetType: 'payment_order', targetId: order.id, reason: `${reason}: ${detail}` });
        await notify(trx, 'payment.review', order.resident_id, { paymentOrderId: order.id }, `payment.review:${tx.id}`);
        return result('REVIEW_REQUIRED');
      };

      if (order.status === 'PAID') return review('DUPLICATE_PAYMENT', `A second payment ${payment.id} was received for an order that is already paid`, false);
      if (order.status !== 'CREATED' && order.status !== 'EXPIRED') return review('RECORD_NOT_PAYABLE', `Order was ${order.status} when payment ${payment.id} arrived`);
      if (payment.currency !== order.currency) return review('CURRENCY_MISMATCH', `Expected ${order.currency}, received ${payment.currency}`);
      if (payment.amountPaise !== Number(order.amount_paise)) {
        return review('AMOUNT_MISMATCH', `Expected ${order.amount_paise} paise, received ${payment.amountPaise}`);
      }

      // Evidence first, effect second (ADR-006, review H-2): the transaction row above must survive even if
      // the business effect throws, so the effect runs inside a savepoint and a failure becomes a review.
      let outcome: { reason: PaymentExceptionReason; detail: string } | null;
      await sql`savepoint apply_purpose`.execute(trx);
      try {
        outcome = await this.applyPurpose(trx, order.purpose, order.ref_type, order.ref_id, payment.amountPaise);
        await sql`release savepoint apply_purpose`.execute(trx);
      } catch (err) {
        await sql`rollback to savepoint apply_purpose`.execute(trx);
        this.logger.error({ err, orderId: order.id }, 'payment effect failed; sent to review');
        outcome = { reason: 'RECORD_NOT_PAYABLE', detail: `Could not apply payment ${payment.id}: ${String((err as Error).message).slice(0, 200)}` };
      }
      if (outcome) return review(outcome.reason, outcome.detail);

      await trx.updateTable('app.payment_orders').set({ status: 'PAID', paid_at: sql`now()` }).where('id', '=', order.id).execute();
      await auditSystem(trx, 'system', null, {
        action: 'payment.verified',
        targetType: 'payment_order',
        targetId: order.id,
        after: { purpose: order.purpose, amountPaise: payment.amountPaise, providerPaymentId: payment.id, via: v.via },
      });
      await notify(trx, order.ref_type === 'BOOKING' ? 'booking.confirmed' : 'payment.verified', order.resident_id, { paymentOrderId: order.id, refId: order.ref_id }, `paid:${order.id}`);
      return result('PAID');
    });
  }

  /** Business effect of a verified payment. Returns a review reason instead of changing state when it no longer fits. */
  private async applyPurpose(
    trx: Tx,
    purpose: PaymentPurpose,
    refType: 'DEMAND_REQUEST' | 'BOOKING',
    refId: string,
    amount: number,
  ): Promise<{ reason: PaymentExceptionReason; detail: string } | null> {
    if (purpose === 'INITIAL' && refType === 'DEMAND_REQUEST') {
      const r = await trx
        .selectFrom('app.demand_requests as r')
        .innerJoin('app.demand_cycles as c', 'c.id', 'r.cycle_id')
        .select(['r.id', 'r.status', 'c.status as cycle_status', 'c.closes_at'])
        .where('r.id', '=', refId)
        .forUpdate('r')
        .executeTakeFirst();
      if (!r || r.status !== 'AWAITING_PAYMENT') return { reason: 'RECORD_NOT_PAYABLE', detail: `Demand request is ${r?.status ?? 'missing'}` };
      if (r.cycle_status !== 'PUBLISHED' || new Date(r.closes_at) < new Date()) {
        await trx.updateTable('app.demand_requests').set({ status: 'REVIEW_REQUIRED' }).where('id', '=', r.id).execute();
        return { reason: 'CYCLE_CLOSED', detail: 'Initial payment arrived after the demand cycle closed' };
      }
      await trx
        .updateTable('app.demand_requests')
        .set({ status: 'COMMITTED', initial_paid_paise: amount, committed_at: sql`now()` })
        .where('id', '=', r.id)
        .execute();
      return null;
    }

    if (refType === 'BOOKING' && (purpose === 'BALANCE' || purpose === 'FULL')) {
      const b = await trx.selectFrom('app.bookings').selectAll().where('id', '=', refId).forUpdate().executeTakeFirst();
      if (!b || b.status !== 'PENDING_PAYMENT') return { reason: 'RECORD_NOT_PAYABLE', detail: `Booking is ${b?.status ?? 'missing'}` };
      const slot = await trx.selectFrom('app.slots').selectAll().where('id', '=', b.slot_id).forUpdate().executeTakeFirstOrThrow();

      if (purpose === 'BALANCE') {
        const set = await trx
          .selectFrom('app.demand_requests as r')
          .innerJoin('app.slots as s', 's.id', 'r.allocated_slot_id')
          .innerJoin('app.slot_sets as ss', 'ss.id', 's.slot_set_id')
          .select(['r.id as request_id', 'r.status', 'ss.balance_due_at'])
          .where('r.id', '=', b.demand_request_id!)
          .executeTakeFirst();
        if (!set || set.status !== 'BALANCE_DUE') return { reason: 'RECORD_NOT_PAYABLE', detail: `Demand request is ${set?.status ?? 'missing'}` };
        if (new Date(set.balance_due_at) < new Date()) {
          await trx.updateTable('app.bookings').set({ status: 'REVIEW_REQUIRED' }).where('id', '=', b.id).execute();
          await trx.updateTable('app.demand_requests').set({ status: 'REVIEW_REQUIRED' }).where('id', '=', set.request_id).execute();
          return { reason: 'DEADLINE_PASSED', detail: 'Balance payment arrived after the published deadline' };
        }
        await trx.updateTable('app.demand_requests').set({ status: 'CONVERTED' }).where('id', '=', set.request_id).execute();
      } else {
        const used = await slotUsage(trx, slot.id, 'CONTINUOUS', b.renews_subscription_id);
        if (slot.status !== 'PUBLISHED' || used >= slot.capacity) {
          await trx.updateTable('app.bookings').set({ status: 'REVIEW_REQUIRED' }).where('id', '=', b.id).execute();
          return { reason: 'SLOT_UNAVAILABLE', detail: `Slot ${slot.label} was full or withdrawn when the payment arrived` };
        }
      }

      await trx.updateTable('app.bookings').set({ status: 'CONFIRMED', confirmed_at: sql`now()` }).where('id', '=', b.id).execute();
      await this.createSubscription(trx, b, slot.start_time);
      return null;
    }
    return { reason: 'RECORD_NOT_PAYABLE', detail: `Unsupported payment purpose ${purpose} for ${refType}` };
  }

  private async createSubscription(
    trx: Tx,
    b: { id: string; resident_id: string; flat_id: string; community_id: string; cluster_id: string | null; start_date: string; terms_snapshot_id: string; renews_subscription_id: string | null },
    slotStart: string,
  ) {
    const snap = await trx.selectFrom('app.booking_terms_snapshots').select(['validity_days', 'plan_snapshot']).where('id', '=', b.terms_snapshot_id).executeTakeFirstOrThrow();
    const sub = await trx
      .insertInto('app.subscriptions')
      .values({
        booking_id: b.id,
        resident_id: b.resident_id,
        flat_id: b.flat_id,
        community_id: b.community_id,
        cluster_id: b.cluster_id,
        period_start: b.start_date,
        period_end: addDays(b.start_date, snap.validity_days - 1),
        renews_subscription_id: b.renews_subscription_id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const comps = ((snap.plan_snapshot as { components?: { serviceId: string; durationMinutes: number; daysOfWeek: number; visitsPerDay: number; isAddon: boolean }[] })
      .components ?? []);
    if (comps.length) {
      await trx
        .insertInto('app.subscription_components')
        .values(
          comps.map((c) => ({
            subscription_id: sub.id,
            cluster_id: b.cluster_id,
            service_id: c.serviceId,
            start_time: slotStart,
            duration_minutes: c.durationMinutes,
            days_of_week: c.daysOfWeek,
            visits_per_day: c.visitsPerDay,
            is_addon: c.isAddon,
          })),
        )
        .execute();
    }
  }

  // ------------------------------------------------------------------ webhooks

  /** Razorpay webhook: verify signature, store raw event once, process idempotently. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined): Promise<'ok' | 'duplicate' | 'rejected' | 'failed'> {
    if (!this.provider) return 'rejected';
    const valid = Boolean(signature) && this.provider.verifyWebhookSignature(rawBody, signature!);
    let body: { event?: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
    try {
      body = JSON.parse(rawBody.toString('utf8')) as typeof body;
    } catch {
      return 'rejected';
    }
    const eventType = String(body.event ?? 'unknown');
    const eventId = eventIdHeader ?? `${eventType}:${String(body.payload?.payment?.entity?.id ?? body.payload?.refund?.entity?.id ?? randomUUID())}`;

    if (!valid) {
      // Keep the forged/unsigned attempt for forensics, but under its own id: it must never occupy the
      // genuine event's id, or the real (signed) delivery would later be dropped as a duplicate.
      await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
        trx
          .insertInto('app.provider_events')
          .values({ event_id: `unverified:${randomUUID()}`, event_type: eventType, payload: JSON.stringify({ claimedEventId: eventId, body }), signature_valid: false })
          .execute(),
      );
      this.logger.warn({ eventType }, 'razorpay webhook with invalid signature rejected');
      return 'rejected';
    }
    // A retry of an event that was never processed re-claims it instead of being treated as a duplicate (review H-3).
    const claimed = await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
      trx
        .insertInto('app.provider_events')
        .values({ event_id: eventId, event_type: eventType, payload: JSON.stringify(body), signature_valid: true, attempts: 1 })
        .onConflict((oc) =>
          oc
            .column('event_id')
            .doUpdateSet({ attempts: sql`app.provider_events.attempts + 1` })
            .where('app.provider_events.processed_at', 'is', null)
            .where('app.provider_events.signature_valid', '=', true),
        )
        .returning('id')
        .executeTakeFirst(),
    );
    if (!claimed) return 'duplicate';
    return (await this.processStored(claimed.id, eventType, body.payload ?? {})) ? 'ok' : 'failed';
  }

  /** Runs one stored event; records success or the error. Returns false when processing threw. */
  private async processStored(rowId: string, eventType: string, payload: Record<string, { entity?: Record<string, unknown> }>): Promise<boolean> {
    try {
      await this.processEvent(eventType, payload);
      await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
        trx.updateTable('app.provider_events').set({ processed_at: sql`now()`, processing_error: null }).where('id', '=', rowId).execute(),
      );
      return true;
    } catch (err) {
      this.logger.error({ err, eventType }, 'razorpay webhook processing failed');
      await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
        trx.updateTable('app.provider_events').set({ processing_error: String((err as Error).message).slice(0, 500) }).where('id', '=', rowId).execute(),
      );
      return false;
    }
  }

  /**
   * Job step (review H-3): retries valid webhook events that were stored but never processed,
   * for example after a crash between storing and processing. After MAX attempts the event is
   * surfaced once in the ADM-08 exceptions queue instead of failing silently.
   */
  async reprocessEvents(now = new Date(), max = 8): Promise<number> {
    const stuck = await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
      trx
        .selectFrom('app.provider_events')
        .select(['id', 'event_id', 'event_type', 'payload', 'attempts'])
        .where('processed_at', 'is', null)
        .where('signature_valid', '=', true)
        .where('received_at', '<', new Date(now.getTime() - 2 * 60_000))
        .where('received_at', '>', new Date(now.getTime() - 7 * 24 * 3600_000))
        .where('attempts', '<=', max)
        .orderBy('received_at')
        .limit(50)
        .execute(),
    );
    let done = 0;
    for (const e of stuck) {
      const attempts = e.attempts + 1;
      await withTx(this.db, SYSTEM_CLAIMS, (trx) => trx.updateTable('app.provider_events').set({ attempts }).where('id', '=', e.id).execute());
      const body = (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload) as { payload?: Record<string, { entity?: Record<string, unknown> }> };
      if (await this.processStored(e.id, e.event_type, body.payload ?? {})) done++;
      else if (attempts > max) {
        await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
          trx.insertInto('app.payment_exceptions').values({ reason_code: 'WEBHOOK_FAILED', detail: `Webhook ${e.event_type} (${e.event_id}) failed ${attempts} times` }).execute(),
        );
      }
    }
    return done;
  }

  private async processEvent(eventType: string, payload: Record<string, { entity?: Record<string, unknown> }>) {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const entity = payload.payment?.entity;
      if (!entity) return;
      const payment = toProviderPayment(entity);
      if (!payment.orderId) return;
      const order = await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
        trx.selectFrom('app.payment_orders').select('id').where('provider_order_id', '=', payment.orderId).executeTakeFirst(),
      );
      if (!order) {
        await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
          trx.insertInto('app.payment_exceptions').values({ reason_code: 'UNKNOWN_ORDER', detail: `Payment ${payment.id} for unknown order ${payment.orderId}` }).execute(),
        );
        return;
      }
      await this.settle(order.id, { payment, via: 'WEBHOOK' });
      return;
    }
    if (eventType === 'refund.processed') {
      const refund = payload.refund?.entity;
      if (!refund) return;
      await this.recordRefund(String(refund.id), String(refund.payment_id), Number(refund.amount));
    }
    // payment.failed: the attempt failed; the order stays open for a retry until it expires.
  }

  /** refund.processed: link to the approved refund (ADR-013), or flag an unapproved one. */
  async recordRefund(providerRefundId: string, providerPaymentId: string, amountPaise: number) {
    await withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
      const done = await trx.selectFrom('app.refund_records').select('id').where('provider_refund_id', '=', providerRefundId).executeTakeFirst();
      if (done) return;
      const tx = await trx
        .selectFrom('app.payment_transactions')
        .select(['id', 'amount_paise', 'cluster_id', 'order_id'])
        .where('provider_payment_id', '=', providerPaymentId)
        .forUpdate()
        .executeTakeFirst();
      if (!tx) {
        await trx.insertInto('app.payment_exceptions').values({ reason_code: 'UNKNOWN_ORDER', detail: `Refund ${providerRefundId} for unknown payment ${providerPaymentId}` }).execute();
        return;
      }
      const approved = await trx
        .selectFrom('app.refund_records')
        .select('id')
        .where('transaction_id', '=', tx.id)
        .where('status', '=', 'APPROVED')
        .where('amount_paise', '=', String(amountPaise))
        .orderBy('created_at')
        .executeTakeFirst();
      if (approved) {
        await trx
          .updateTable('app.refund_records')
          .set({ status: 'PROCESSED', provider_refund_id: providerRefundId, processed_at: sql`now()` })
          .where('id', '=', approved.id)
          .execute();
      } else {
        await trx
          .insertInto('app.refund_records')
          .values({ transaction_id: tx.id, cluster_id: tx.cluster_id, amount_paise: amountPaise, status: 'PROCESSED', provider_refund_id: providerRefundId, processed_at: new Date() })
          .execute();
        await trx
          .insertInto('app.payment_exceptions')
          .values({ order_id: tx.order_id, transaction_id: tx.id, cluster_id: tx.cluster_id, reason_code: 'UNAPPROVED_REFUND', detail: `Refund ${providerRefundId} was issued without an approval in Nestovin` })
          .execute();
      }
      const refunded = await trx
        .selectFrom('app.refund_records')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount_paise'), sql<string>`0`).as('total'))
        .where('transaction_id', '=', tx.id)
        .where('status', '=', 'PROCESSED')
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('app.payment_transactions')
        .set({ status: Number(refunded.total) >= Number(tx.amount_paise) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' })
        .where('id', '=', tx.id)
        .execute();
      await auditSystem(trx, 'system', null, { action: 'refund.processed', targetType: 'payment_transaction', targetId: tx.id, after: { providerRefundId, amountPaise } });
    });
  }

  // ------------------------------------------------------------------ maintenance

  /**
   * Periodic job: reconcile open orders with Razorpay (covers "paid but the app
   * never called back"), expire stale orders, close finished cycles and expire
   * unpaid demand-led balances (ADR-013: initial amount retained).
   */
  async maintenance(now = new Date()): Promise<{ reconciled: number; reprocessedEvents: number; expiredOrders: number; closedCycles: number; expiredBalances: number; endedSubscriptions: number; lapsedBookings: number }> {
    let reconciled = 0;
    let reprocessedEvents = 0;
    if (this.provider) {
      try {
        reprocessedEvents = await this.reprocessEvents(now);
      } catch (err) {
        this.logger.error({ err }, 'webhook reprocessing failed');
      }
    }
    if (this.provider) {
      const open = await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
        trx
          .selectFrom('app.payment_orders')
          .select(['id', 'provider_order_id'])
          .where('status', 'in', ['CREATED', 'EXPIRED'])
          .where('provider_order_id', 'is not', null)
          .where('created_at', '<', new Date(now.getTime() - 2 * 60_000))
          .where('created_at', '>', new Date(now.getTime() - 3 * 24 * 3600_000))
          // Review H-7: least-recently-checked first, with exponential backoff (2 min × 2^n, capped at 2^8),
          // so every open order is checked in turn instead of the same 50 every minute.
          .where(sql<boolean>`last_checked_at is null or last_checked_at < ${now}::timestamptz - (interval '2 minutes' * power(2, least(check_count, 8)))`)
          .orderBy(sql`last_checked_at nulls first`)
          .orderBy('created_at', 'desc')
          .limit(50)
          .execute(),
      );
      for (const o of open) {
        await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
          trx
            .updateTable('app.payment_orders')
            .set({ last_checked_at: now, check_count: sql`check_count + 1` })
            .where('id', '=', o.id)
            .execute(),
        );
        try {
          const payments = await this.provider.fetchOrderPayments(o.provider_order_id!);
          for (const p of payments.filter((x) => x.status === 'captured')) {
            await this.settle(o.id, { payment: p, via: 'RECONCILIATION' });
            reconciled++;
          }
        } catch (err) {
          this.logger.warn({ err, orderId: o.id }, 'reconciliation failed for order');
        }
      }
    }

    return withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
      const expiredOrders = await trx
        .updateTable('app.payment_orders')
        .set({ status: 'EXPIRED' })
        .where('status', '=', 'CREATED')
        .where('expires_at', '<', now)
        .executeTakeFirst();

      const closing = await trx
        .updateTable('app.demand_cycles')
        .set({ status: 'CLOSED', closed_at: now })
        .where('status', '=', 'PUBLISHED')
        .where('closes_at', '<', now)
        .returning('id')
        .execute();
      if (closing.length) {
        await trx
          .updateTable('app.demand_requests')
          .set({ status: 'CANCELLED', ended_at: now, end_reason: 'The demand cycle closed before the initial payment' })
          .where('cycle_id', 'in', closing.map((c) => c.id))
          .where('status', '=', 'AWAITING_PAYMENT')
          .execute();
      }

      const overdue = await trx
        .selectFrom('app.demand_requests as r')
        .innerJoin('app.slots as s', 's.id', 'r.allocated_slot_id')
        .innerJoin('app.slot_sets as ss', 'ss.id', 's.slot_set_id')
        .select(['r.id'])
        .where('r.status', '=', 'BALANCE_DUE')
        .where('ss.balance_due_at', '<', now)
        .execute();
      for (const r of overdue) {
        await trx
          .updateTable('app.demand_requests')
          .set({ status: 'EXPIRED', ended_at: now, end_reason: 'Balance not paid by the deadline; initial payment retained (ADR-013)' })
          .where('id', '=', r.id)
          .execute();
        await trx
          .updateTable('app.bookings')
          .set({ status: 'EXPIRED', ended_at: now, end_reason: 'Balance not paid by the deadline' })
          .where('demand_request_id', '=', r.id)
          .where('status', '=', 'PENDING_PAYMENT')
          .execute();
        await auditSystem(trx, 'system', null, { action: 'demand_request.expired', targetType: 'demand_request', targetId: r.id, reason: 'Balance deadline passed' });
      }
      // Subscriptions end after their period; their standing workers are released.
      const today = businessToday(now);
      const ended = await trx
        .updateTable('app.subscriptions')
        .set({ status: 'ENDED' })
        .where('status', 'in', ['PENDING_ACTIVATION', 'ACTIVE'])
        .where('period_end', '<', today)
        .returning(['id', 'period_end'])
        .execute();
      for (const sub of ended) {
        await trx
          .updateTable('app.standing_assignments')
          .set({ status: 'ENDED', effective_to: sub.period_end, end_reason: 'Subscription ended' })
          .where('status', '=', 'ACTIVE')
          .where('subscription_component_id', 'in', (eb) => eb.selectFrom('app.subscription_components').select('id').where('subscription_id', '=', sub.id))
          .execute();
      }
      // Unpaid continuous bookings lapse once their start date has passed (no capacity was held).
      const lapsed = await trx
        .updateTable('app.bookings')
        .set({ status: 'EXPIRED', ended_at: now, end_reason: 'Not paid before the start date' })
        .where('mode', '=', 'CONTINUOUS')
        .where('status', '=', 'PENDING_PAYMENT')
        .where('start_date', '<', today)
        .executeTakeFirst();
      return {
        reconciled,
        reprocessedEvents,
        expiredOrders: Number(expiredOrders.numUpdatedRows),
        closedCycles: closing.length,
        expiredBalances: overdue.length,
        endedSubscriptions: ended.length,
        lapsedBookings: Number(lapsed.numUpdatedRows),
      };
    });
  }
}

function result(status: string): PaymentResult {
  switch (status) {
    case 'PAID':
      return { orderStatus: 'PAID', message: 'Payment received and verified.' };
    case 'REVIEW_REQUIRED':
      return { orderStatus: 'REVIEW_REQUIRED', message: 'Payment received. Our team is reviewing it and will contact you.' };
    case 'EXPIRED':
      return { orderStatus: 'EXPIRED', message: 'This payment request expired.' };
    case 'FAILED':
      return { orderStatus: 'FAILED', message: 'The payment failed. You can try again.' };
    default:
      return { orderStatus: 'CREATED', message: 'Payment is still being processed.' };
  }
}

export async function setting<T>(trx: Tx | Database, key: string, fallback: T): Promise<T> {
  const r = await trx.selectFrom('app.app_settings').select('value').where('key', '=', key).executeTakeFirst();
  return (r?.value as T | undefined) ?? fallback;
}
