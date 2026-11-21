import {
  NON_REFUNDABLE_DISCLOSURE,
  type BookingDetail,
  type BookingOptions,
  type BookingView,
  type Checkout,
  type CreateBookingInput,
  type CreateDemandRequestInput,
  type ResidentDemandRequest,
  type PaymentResult,
  type TestCompletePaymentInput,
  type VerifyPaymentInput,
} from '@nestovin/contracts';
import { sql } from 'kysely';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { businessRule, conflict, notFound } from '../../lib/errors';
import { auditResident } from '../audit/audit';
import { residentClaims, type ResidentActor } from '../residents/auth';
import { addDays, assertMode, planSnapshot, priceSelection, splitInitial } from './pricing';
import type { PaymentService} from './payments';
import { setting, slotUsage } from './payments';
import { bookingViews } from './views';
import { businessToday } from '../../lib/dates';

const today = () => businessToday();

/** RES-06..09 for the Resident app. Verified residence required (ADR-015). */
export class ResidentBookingService {
  constructor(
    private readonly db: Database,
    private readonly payments: PaymentService,
  ) {}

  private tx<T>(actor: ResidentActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, residentClaims(actor), fn);
  }

  /** The caller's VERIFIED household context, with the flat's pricing category. */
  private async household(trx: Tx, actor: ResidentActor) {
    const m = await trx
      .selectFrom('app.residence_memberships as m')
      .innerJoin('app.flats as f', 'f.id', 'm.flat_id')
      .innerJoin('app.communities as c', 'c.id', 'm.community_id')
      .select(['m.id', 'm.status', 'm.flat_id', 'm.community_id', 'm.cluster_id', 'f.residence_category_id', 'c.name as community_name', 'c.status as community_status'])
      .where('m.resident_id', '=', actor.id)
      .where('m.status', 'in', ['PENDING', 'VERIFIED'])
      .executeTakeFirst();
    return m ?? null;
  }

  private async verifiedHousehold(trx: Tx, actor: ResidentActor) {
    const m = await this.household(trx, actor);
    if (!m || m.status !== 'VERIFIED') throw businessRule('Your residence must be verified before you can book a service');
    if (!m.residence_category_id) throw businessRule('Your flat does not have a pricing category yet. Contact Nestovin support.');
    return { ...m, residence_category_id: m.residence_category_id };
  }

  async options(actor: ResidentActor): Promise<BookingOptions> {
    return this.tx(actor, async (trx) => {
      const windowDays = await setting(trx, 'booking_window_days', 14);
      const range = { from: addDays(today(), 1), to: addDays(today(), windowDays) };
      const base: BookingOptions = { eligible: false, reason: null, reasonCode: null, communityName: null, openCycles: [], continuousSlots: [], startDateRange: range, disclosure: { ...NON_REFUNDABLE_DISCLOSURE } };
      const m = await this.household(trx, actor);
      if (!m) return { ...base, reasonCode: 'NOT_REGISTERED', reason: 'Register your flat to book a service.' };
      const at = { ...base, communityName: m.community_name };
      if (m.status !== 'VERIFIED') return { ...at, reasonCode: 'NOT_VERIFIED', reason: 'Your residence is waiting for verification.' };
      if (m.community_status !== 'ACTIVE') return { ...at, reasonCode: 'COMMUNITY_NOT_LIVE', reason: `Booking is not open in ${m.community_name} yet.` };
      if (!m.residence_category_id) return { ...at, reasonCode: 'NO_CATEGORY', reason: 'Your flat does not have a pricing category yet. Contact Nestovin support.' };

      const now = new Date();
      const cycles = await trx
        .selectFrom('app.demand_cycles')
        .select(['id', 'name', 'closes_at', 'initial_pct'])
        .where('community_id', '=', m.community_id)
        .where('status', '=', 'PUBLISHED')
        .where('opens_at', '<=', now)
        .where('closes_at', '>', now)
        .orderBy('closes_at')
        .execute();
      const cyclePlans = cycles.length
        ? await trx.selectFrom('app.demand_cycle_plans').selectAll().where('cycle_id', 'in', cycles.map((c) => c.id)).execute()
        : [];
      const windows = await trx
        .selectFrom('app.time_windows')
        .select(['id', 'name', 'start_time', 'end_time'])
        .where('community_id', '=', m.community_id)
        .where('status', '=', 'ACTIVE')
        .orderBy('start_time')
        .execute();
      const slots = await trx
        .selectFrom('app.slots')
        .selectAll()
        .where('community_id', '=', m.community_id)
        .where('mode', '=', 'CONTINUOUS')
        .where('status', '=', 'PUBLISHED')
        .orderBy('start_time')
        .execute();
      const continuousSlots = [];
      for (const s of slots) {
        continuousSlots.push({
          id: s.id,
          label: s.label,
          serviceId: s.service_id,
          startTime: s.start_time.slice(0, 5),
          durationMinutes: s.duration_minutes,
          daysOfWeek: s.days_of_week,
          available: (await slotUsage(trx, s.id, 'CONTINUOUS')) < s.capacity,
        });
      }
      return {
        ...at,
        eligible: true,
        openCycles: cycles.map((c) => ({
          id: c.id,
          name: c.name,
          closesAt: new Date(c.closes_at).toISOString(),
          initialPct: c.initial_pct!,
          planIds: cyclePlans.filter((p) => p.cycle_id === c.id).map((p) => p.plan_id),
          timeWindows: windows.map((w) => ({ id: w.id, name: w.name, startTime: w.start_time.slice(0, 5), endTime: w.end_time.slice(0, 5) })),
        })),
        continuousSlots,
      };
    });
  }

  // ------------------------------------------------------------------ demand-led

  async createDemandRequest(actor: ResidentActor, requestId: string, input: CreateDemandRequestInput, idempotencyKey?: string): Promise<{ request: ResidentDemandRequest; checkout: Checkout }> {
    if (input.disclosureVersion !== NON_REFUNDABLE_DISCLOSURE.version) {
      throw businessRule('The payment terms have changed. Review them again before continuing.');
    }
    const { id, checkout } = await this.tx(actor, async (trx) => {
      const m = await this.verifiedHousehold(trx, actor);
      const now = new Date();
      const cycle = await trx.selectFrom('app.demand_cycles').selectAll().where('id', '=', input.cycleId).executeTakeFirst();
      if (!cycle || cycle.community_id !== m.community_id) throw notFound('Demand cycle');
      if (cycle.status !== 'PUBLISHED' || new Date(cycle.opens_at) > now || new Date(cycle.closes_at) <= now) {
        throw businessRule('This demand cycle is not open for requests');
      }
      const eligible = await trx
        .selectFrom('app.demand_cycle_plans')
        .select('plan_id')
        .where('cycle_id', '=', cycle.id)
        .where('plan_id', '=', input.selection.planId)
        .executeTakeFirst();
      if (!eligible) throw businessRule('This plan is not part of the demand cycle');

      const windows = await trx
        .selectFrom('app.time_windows')
        .select(['id'])
        .where('community_id', '=', m.community_id)
        .where('status', '=', 'ACTIVE')
        .where('id', 'in', input.preferredWindowIds)
        .execute();
      if (windows.length !== new Set(input.preferredWindowIds).size) throw businessRule('Choose your preferred time from the listed options');

      const priced = await priceSelection(trx, { versionId: cycle.catalogue_version_id!, categoryId: m.residence_category_id, selection: input.selection });
      await assertMode(trx, m.community_id, priced.serviceIds, 'DEMAND_LED');
      const split = splitInitial(priced.totalPaise, cycle.initial_pct);

      const snap = await trx
        .insertInto('app.booking_terms_snapshots')
        .values({
          resident_id: actor.id,
          flat_id: m.flat_id,
          community_id: m.community_id,
          cluster_id: m.cluster_id,
          catalogue_version_id: priced.versionId,
          plan_id: priced.planId,
          service_id: priced.serviceId,
          residence_category_id: priced.categoryId,
          plan_snapshot: JSON.stringify(planSnapshot(priced)),
          total_paise: priced.totalPaise,
          initial_pct: cycle.initial_pct,
          initial_due_paise: split.initial,
          remaining_due_paise: split.remaining,
          cycle_id: cycle.id,
          validity_days: priced.validityDays,
          disclosure_version: NON_REFUNDABLE_DISCLOSURE.version,
          disclosure_accepted_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const req = await trx
        .insertInto('app.demand_requests')
        .values({
          cycle_id: cycle.id,
          resident_id: actor.id,
          membership_id: m.id,
          flat_id: m.flat_id,
          community_id: m.community_id,
          cluster_id: m.cluster_id,
          terms_snapshot_id: snap.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === '23505') throw conflict('Your household already has a request in this demand cycle');
          throw err;
        });
      await trx
        .insertInto('app.demand_request_preferences')
        .values(input.preferredWindowIds.map((w, i) => ({ request_id: req.id, rank: i + 1, time_window_id: w })))
        .execute();
      await auditResident(trx, actor.id, requestId, {
        action: 'demand_request.created',
        targetType: 'demand_request',
        targetId: req.id,
        after: { cycleId: cycle.id, planId: priced.planId, totalPaise: priced.totalPaise, initialPct: cycle.initial_pct, disclosureVersion: NON_REFUNDABLE_DISCLOSURE.version },
      });
      const checkout = await this.payments.orderFor(trx, {
        purpose: 'INITIAL',
        refType: 'DEMAND_REQUEST',
        refId: req.id,
        residentId: actor.id,
        flatId: m.flat_id,
        communityId: m.community_id,
        clusterId: m.cluster_id,
        amountPaise: split.initial,
        description: `${priced.planName} – initial payment`,
        idempotencyKey,
      });
      return { id: req.id, checkout };
    });
    const request = (await this.demandRequests(actor)).find((r) => r.id === id)!;
    return { request, checkout };
  }

  /** Retry the payment of a demand request (initial) or a booking (balance / full). */
  async payAgain(actor: ResidentActor, ref: { type: 'DEMAND_REQUEST' | 'BOOKING'; id: string }, idempotencyKey?: string): Promise<Checkout> {
    return this.tx(actor, async (trx) => {
      if (ref.type === 'DEMAND_REQUEST') {
        const r = await trx
          .selectFrom('app.demand_requests as r')
          .innerJoin('app.booking_terms_snapshots as t', 't.id', 'r.terms_snapshot_id')
          .innerJoin('app.demand_cycles as c', 'c.id', 'r.cycle_id')
          .select(['r.id', 'r.status', 'r.flat_id', 'r.community_id', 'r.cluster_id', 't.initial_due_paise', 'c.status as cycle_status', 'c.closes_at'])
          .where('r.id', '=', ref.id)
          .executeTakeFirst();
        if (!r) throw notFound('Request');
        if (r.status !== 'AWAITING_PAYMENT') throw businessRule('This request does not need a payment');
        if (r.cycle_status !== 'PUBLISHED' || new Date(r.closes_at) <= new Date()) throw businessRule('This demand cycle is closed');
        return this.payments.orderFor(trx, {
          purpose: 'INITIAL', refType: 'DEMAND_REQUEST', refId: r.id, residentId: actor.id, flatId: r.flat_id, communityId: r.community_id,
          clusterId: r.cluster_id, amountPaise: Number(r.initial_due_paise), description: 'Initial payment', idempotencyKey,
        });
      }
      const b = await trx
        .selectFrom('app.bookings as b')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'b.terms_snapshot_id')
        .innerJoin('app.slots as s', 's.id', 'b.slot_id')
        .select(['b.id', 'b.mode', 'b.status', 'b.flat_id', 'b.community_id', 'b.cluster_id', 'b.renews_subscription_id', 't.total_paise', 't.remaining_due_paise', 's.id as slot_id', 's.capacity', 's.status as slot_status'])
        .where('b.id', '=', ref.id)
        .executeTakeFirst();
      if (!b) throw notFound('Booking');
      if (b.status !== 'PENDING_PAYMENT') throw businessRule('This booking does not need a payment');
      if (b.mode === 'CONTINUOUS' && (b.slot_status !== 'PUBLISHED' || (await slotUsage(trx, b.slot_id, 'CONTINUOUS', b.renews_subscription_id)) >= b.capacity)) {
        throw businessRule('This slot is no longer available. Choose another slot.');
      }
      const purpose = b.mode === 'DEMAND_LED' ? 'BALANCE' : 'FULL';
      return this.payments.orderFor(trx, {
        purpose, refType: 'BOOKING', refId: b.id, residentId: actor.id, flatId: b.flat_id, communityId: b.community_id, clusterId: b.cluster_id,
        amountPaise: Number(purpose === 'BALANCE' ? b.remaining_due_paise : b.total_paise),
        description: purpose === 'BALANCE' ? 'Remaining balance' : 'Booking payment', idempotencyKey,
      });
    });
  }

  async cancelDemandRequest(actor: ResidentActor, requestId: string, id: string): Promise<ResidentDemandRequest[]> {
    await this.tx(actor, async (trx) => {
      const r = await trx
        .updateTable('app.demand_requests')
        .set({ status: 'CANCELLED', ended_at: sql`now()`, end_reason: 'Cancelled by resident before payment' })
        .where('id', '=', id)
        .where('status', '=', 'AWAITING_PAYMENT')
        .executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw businessRule('Only a request that has not been paid can be cancelled');
      await auditResident(trx, actor.id, requestId, { action: 'demand_request.cancelled', targetType: 'demand_request', targetId: id });
    });
    return this.demandRequests(actor);
  }

  async demandRequests(actor: ResidentActor): Promise<ResidentDemandRequest[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.demand_requests as r')
        .innerJoin('app.demand_cycles as c', 'c.id', 'r.cycle_id')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'r.terms_snapshot_id')
        .leftJoin('app.bookings as b', 'b.demand_request_id', 'r.id')
        .select([
          'r.id', 'r.reference', 'r.status', 'r.initial_paid_paise', 'r.created_at', 'c.name as cycle_name', 't.plan_snapshot', 't.total_paise',
          't.initial_pct', 't.initial_due_paise', 't.remaining_due_paise', 'b.id as booking_id',
        ])
        .orderBy('r.created_at', 'desc')
        .limit(50)
        .execute();
      const prefs = rows.length
        ? await trx
            .selectFrom('app.demand_request_preferences as p')
            .innerJoin('app.time_windows as w', 'w.id', 'p.time_window_id')
            .select(['p.request_id', 'p.rank', 'w.name'])
            .where('p.request_id', 'in', rows.map((r) => r.id))
            .orderBy('p.rank')
            .execute()
        : [];
      return rows.map((r) => {
        const snap = r.plan_snapshot as { planName: string; selectionLabel: string };
        return {
          id: r.id,
          reference: r.reference,
          cycleName: r.cycle_name,
          status: r.status,
          planName: snap.planName,
          selectionLabel: snap.selectionLabel,
          totalPaise: Number(r.total_paise),
          initialPct: r.initial_pct ?? 100,
          initialDuePaise: Number(r.initial_due_paise),
          initialPaidPaise: Number(r.initial_paid_paise),
          remainingDuePaise: Number(r.remaining_due_paise),
          preferredWindows: prefs.filter((p) => p.request_id === r.id).map((p) => p.name),
          bookingId: r.booking_id,
          createdAt: new Date(r.created_at).toISOString(),
        };
      });
    });
  }

  // ------------------------------------------------------------------ continuous

  async createBooking(actor: ResidentActor, requestId: string, input: CreateBookingInput, idempotencyKey?: string): Promise<{ booking: BookingView; checkout: Checkout }> {
    const { id, checkout } = await this.tx(actor, async (trx) => {
      const m = await this.verifiedHousehold(trx, actor);
      const windowDays = await setting(trx, 'booking_window_days', 14);
      if (input.startDate < addDays(today(), 1) || input.startDate > addDays(today(), windowDays)) {
        throw businessRule(`Choose a start date between tomorrow and ${windowDays} days from today`);
      }
      const slot = await trx.selectFrom('app.slots').selectAll().where('id', '=', input.slotId).executeTakeFirst();
      if (!slot || slot.community_id !== m.community_id || slot.mode !== 'CONTINUOUS' || slot.status !== 'PUBLISHED') throw notFound('Slot');
      if ((await slotUsage(trx, slot.id, 'CONTINUOUS')) >= slot.capacity) throw businessRule('This slot is full. Choose another slot.');

      const version = await trx
        .selectFrom('app.catalogue_versions')
        .select('id')
        .where('community_id', '=', m.community_id)
        .where('status', '=', 'PUBLISHED')
        .executeTakeFirst();
      if (!version) throw businessRule('Plans are not published for your community yet');
      const priced = await priceSelection(trx, { versionId: version.id, categoryId: m.residence_category_id, selection: input.selection });
      await assertMode(trx, m.community_id, priced.serviceIds, 'CONTINUOUS');
      if (slot.service_id && !priced.serviceIds.includes(slot.service_id)) throw businessRule('This slot is for a different service');

      const bookingId = await this.insertBooking(trx, actor, m, priced, { slotId: slot.id, startDate: input.startDate, renews: null });
      await auditResident(trx, actor.id, requestId, {
        action: 'booking.created', targetType: 'booking', targetId: bookingId, after: { slotId: slot.id, planId: priced.planId, totalPaise: priced.totalPaise },
      });
      const checkout = await this.payments.orderFor(trx, {
        purpose: 'FULL', refType: 'BOOKING', refId: bookingId, residentId: actor.id, flatId: m.flat_id, communityId: m.community_id,
        clusterId: m.cluster_id, amountPaise: priced.totalPaise, description: `${priced.planName} – ${priced.selectionLabel}`, idempotencyKey,
      });
      return { id: bookingId, checkout };
    });
    const booking = (await this.bookings(actor)).find((b) => b.id === id)!;
    return { booking, checkout };
  }

  private async insertBooking(
    trx: Tx,
    actor: ResidentActor,
    m: { id: string; flat_id: string; community_id: string; cluster_id: string | null },
    priced: Awaited<ReturnType<typeof priceSelection>>,
    opts: { slotId: string; startDate: string; renews: string | null },
  ) {
    const snap = await trx
      .insertInto('app.booking_terms_snapshots')
      .values({
        resident_id: actor.id,
        flat_id: m.flat_id,
        community_id: m.community_id,
        cluster_id: m.cluster_id,
        catalogue_version_id: priced.versionId,
        plan_id: priced.planId,
        service_id: priced.serviceId,
        residence_category_id: priced.categoryId,
        plan_snapshot: JSON.stringify(planSnapshot(priced)),
        total_paise: priced.totalPaise,
        initial_pct: null,
        initial_due_paise: priced.totalPaise,
        remaining_due_paise: 0,
        validity_days: priced.validityDays,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const b = await trx
      .insertInto('app.bookings')
      .values({
        mode: 'CONTINUOUS',
        resident_id: actor.id,
        membership_id: m.id,
        flat_id: m.flat_id,
        community_id: m.community_id,
        cluster_id: m.cluster_id,
        terms_snapshot_id: snap.id,
        slot_id: opts.slotId,
        start_date: opts.startDate,
        renews_subscription_id: opts.renews,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return b.id;
  }

  /**
   * ADR-013 renewal: same flat, plan (by code) and slot, at 100% of the currently
   * published price. Starts the day after the current period ends.
   */
  async renew(actor: ResidentActor, requestId: string, subscriptionId: string, idempotencyKey?: string): Promise<{ booking: BookingView; checkout: Checkout }> {
    const { id, checkout } = await this.tx(actor, async (trx) => {
      const m = await this.verifiedHousehold(trx, actor);
      const s = await trx
        .selectFrom('app.subscriptions as s')
        .innerJoin('app.bookings as b', 'b.id', 's.booking_id')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'b.terms_snapshot_id')
        .innerJoin('app.plans as p', 'p.id', 't.plan_id')
        .select(['s.id', 's.status', 's.period_end', 's.flat_id', 'b.slot_id', 't.service_id', 't.plan_snapshot', 'p.code as plan_code'])
        .where('s.id', '=', subscriptionId)
        .executeTakeFirst();
      if (!s || s.flat_id !== m.flat_id) throw notFound('Subscription');
      if (!['PENDING_ACTIVATION', 'ACTIVE'].includes(s.status)) throw businessRule('Only a current subscription can be renewed');
      const existing = await trx
        .selectFrom('app.bookings')
        .select('id')
        .where('renews_subscription_id', '=', s.id)
        .where('status', 'in', ['PENDING_PAYMENT', 'CONFIRMED', 'REVIEW_REQUIRED'])
        .executeTakeFirst();
      if (existing) throw conflict('A renewal for this subscription already exists');

      const version = await trx
        .selectFrom('app.catalogue_versions')
        .select('id')
        .where('community_id', '=', m.community_id)
        .where('status', '=', 'PUBLISHED')
        .executeTakeFirst();
      if (!version) throw businessRule('Plans are not published for your community right now');
      const plan = await trx.selectFrom('app.plans').select('id').where('catalogue_version_id', '=', version.id).where('code', '=', s.plan_code).executeTakeFirst();
      if (!plan) throw businessRule('This plan is no longer offered. Choose a new plan instead.');
      const prevAddonServices = ((s.plan_snapshot as { components: { isAddon: boolean; serviceId: string }[] }).components ?? [])
        .filter((c) => c.isAddon)
        .map((c) => c.serviceId);
      const addonIds = prevAddonServices.length
        ? (
            await trx
              .selectFrom('app.plan_components')
              .select('id')
              .where('plan_id', '=', plan.id)
              .where('is_optional_addon', '=', true)
              .where('service_id', 'in', prevAddonServices)
              .execute()
          ).map((c) => c.id)
        : [];
      const priced = await priceSelection(trx, {
        versionId: version.id,
        categoryId: m.residence_category_id,
        selection: { planId: plan.id, serviceId: s.service_id, addonComponentIds: addonIds },
      });
      const slot = await trx.selectFrom('app.slots').selectAll().where('id', '=', s.slot_id).executeTakeFirstOrThrow();
      if (slot.status !== 'PUBLISHED' && slot.mode === 'CONTINUOUS') throw businessRule('Your current slot is no longer offered. Book a new slot instead.');
      // Demand-led subscriptions renew into a continuous booking on the same time only if such a slot exists.
      let slotId = slot.id;
      if (slot.mode === 'DEMAND_LED') {
        const same = await trx
          .selectFrom('app.slots')
          .select('id')
          .where('community_id', '=', m.community_id)
          .where('mode', '=', 'CONTINUOUS')
          .where('status', '=', 'PUBLISHED')
          .where('start_time', '=', slot.start_time)
          .executeTakeFirst();
        if (!same) throw businessRule('Renewal for this time is not open yet. We will notify you when it is.');
        slotId = same.id;
      }
      // bookings_one_live_renewal (unique, partial) closes the double-tap race the check above can't (review H-2).
      const bookingId = await this.insertBooking(trx, actor, m, priced, { slotId, startDate: addDays(s.period_end, 1), renews: s.id }).catch((err: unknown) => {
        if ((err as { code?: string; constraint?: string }).constraint === 'bookings_one_live_renewal') throw conflict('A renewal for this subscription already exists');
        throw err;
      });
      await auditResident(trx, actor.id, requestId, { action: 'subscription.renewal_started', targetType: 'subscription', targetId: s.id, after: { bookingId, totalPaise: priced.totalPaise } });
      const checkout = await this.payments.orderFor(trx, {
        purpose: 'FULL', refType: 'BOOKING', refId: bookingId, residentId: actor.id, flatId: m.flat_id, communityId: m.community_id,
        clusterId: m.cluster_id, amountPaise: priced.totalPaise, description: `Renewal – ${priced.planName}`, idempotencyKey,
      });
      return { id: bookingId, checkout };
    });
    const booking = (await this.bookings(actor)).find((b) => b.id === id)!;
    return { booking, checkout };
  }

  async bookings(actor: ResidentActor): Promise<BookingView[]> {
    return this.tx(actor, (trx) => bookingViews(trx, {}));
  }

  /** One of the household's bookings with the agreed terms and every payment attempt (RLS scopes rows). */
  async booking(actor: ResidentActor, bookingId: string): Promise<BookingDetail> {
    return this.tx(actor, async (trx) => {
      const [view] = await bookingViews(trx, { id: bookingId, limit: 1 });
      if (!view) throw notFound('Booking');
      const b = await trx
        .selectFrom('app.bookings as b')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'b.terms_snapshot_id')
        .select(['b.demand_request_id', 't.plan_snapshot', 't.initial_pct', 't.tax_paise', 't.validity_days', 't.disclosure_version', 't.disclosure_accepted_at'])
        .where('b.id', '=', bookingId)
        .executeTakeFirstOrThrow();
      type SnapComponent = { serviceName?: string; isAddon?: boolean; visitsPerDay?: number; daysOfWeek?: number; durationMinutes?: number; addonHours?: number | null; tasks?: { name: string; frequency: string; timesPerPeriod: number }[] };
      const comps = ((b.plan_snapshot as { components?: SnapComponent[] } | null)?.components ?? []).map((c) => ({
        serviceName: c.serviceName ?? 'Service',
        isAddon: Boolean(c.isAddon),
        visitsPerDay: c.visitsPerDay ?? 1,
        daysOfWeek: c.daysOfWeek ?? 127,
        durationMinutes: c.durationMinutes ?? 0,
        addonHours: c.addonHours ?? null,
        tasks: (c.tasks ?? []).map((t) => ({ name: t.name, frequency: t.frequency, timesPerPeriod: t.timesPerPeriod })),
      }));
      const orders = await trx
        .selectFrom('app.payment_orders')
        .select(['id', 'purpose', 'amount_paise', 'status', 'created_at', 'paid_at'])
        .where((eb) =>
          eb.or([
            eb.and([eb('ref_type', '=', 'BOOKING'), eb('ref_id', '=', bookingId)]),
            ...(b.demand_request_id ? [eb.and([eb('ref_type', '=', 'DEMAND_REQUEST'), eb('ref_id', '=', b.demand_request_id)])] : []),
          ]),
        )
        .orderBy('created_at')
        .execute();
      return {
        ...view,
        terms: {
          components: comps,
          initialPct: b.initial_pct,
          taxPaise: b.tax_paise === null ? null : Number(b.tax_paise),
          validityDays: b.validity_days,
          disclosureVersion: b.disclosure_version,
          disclosureAcceptedAt: b.disclosure_accepted_at ? new Date(b.disclosure_accepted_at).toISOString() : null,
        },
        payments: orders.map((o) => ({
          id: o.id,
          purpose: o.purpose,
          amountPaise: Number(o.amount_paise),
          status: o.status,
          createdAt: new Date(o.created_at).toISOString(),
          paidAt: o.paid_at ? new Date(o.paid_at).toISOString() : null,
        })),
      };
    });
  }

  async verifyPayment(actor: ResidentActor, input: VerifyPaymentInput) {
    return this.payments.verifyCheckout(residentClaims(actor), input);
  }

  /** Dev-only demo payment (TEST_PAYMENTS_ENABLED): same verification path as verifyPayment, plus a resident audit row. */
  async testCompletePayment(actor: ResidentActor, requestId: string, input: TestCompletePaymentInput): Promise<PaymentResult> {
    const out = await this.payments.testComplete(residentClaims(actor), input);
    await this.tx(actor, (trx) =>
      auditResident(trx, actor.id, requestId, {
        action: 'payment.test_completed',
        targetType: 'payment_order',
        targetId: input.paymentOrderId,
        reason: 'Dev-only test payment (TEST_PAYMENTS_ENABLED)',
        after: { orderStatus: out.orderStatus },
      }),
    );
    return out;
  }
}
