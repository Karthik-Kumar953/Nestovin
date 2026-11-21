import type { AdminBooking, BookingView } from '@nestovin/contracts';
import type { Tx } from '../../db/database';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/**
 * Booking + subscription + payment state as one view, without conflating them
 * (RES-09). RLS decides which rows the caller sees.
 */
export async function bookingViews(
  trx: Tx,
  f: { id?: string; status?: string | undefined; communityId?: string | undefined; residentId?: string | undefined; limit?: number; before?: { at: string; id: string } | undefined },
): Promise<AdminBooking[] & BookingView[]> {
  let q = trx
    .selectFrom('app.bookings as b')
    .innerJoin('app.booking_terms_snapshots as t', 't.id', 'b.terms_snapshot_id')
    .innerJoin('app.slots as s', 's.id', 'b.slot_id')
    .innerJoin('app.resident_profiles as p', 'p.id', 'b.resident_id')
    .innerJoin('app.flats as f', 'f.id', 'b.flat_id')
    .innerJoin('app.towers as tw', 'tw.id', 'f.tower_id')
    .innerJoin('app.communities as c', 'c.id', 'b.community_id')
    .leftJoin('app.subscriptions as sub', 'sub.booking_id', 'b.id')
    .leftJoin('app.demand_requests as r', 'r.id', 'b.demand_request_id')
    .leftJoin('app.slot_sets as ss', 'ss.id', 's.slot_set_id')
    .select([
      'b.id', 'b.reference', 'b.mode', 'b.status', 'b.start_date', 'b.created_at', 'b.version', 'b.resident_id',
      't.plan_snapshot', 't.total_paise', 't.remaining_due_paise', 'r.initial_paid_paise',
      's.label as slot_label', 's.start_time', 's.duration_minutes', 's.days_of_week', 'ss.balance_due_at',
      'p.full_name', 'p.phone', 'f.flat_number', 'tw.name as tower_name', 'c.name as community_name',
      'sub.id as sub_id', 'sub.period_start', 'sub.period_end', 'sub.status as sub_status',
    ])
    .select((eb) =>
      eb
        .selectFrom('app.payment_orders as o')
        .select((e2) => e2.fn.coalesce(e2.fn.sum<string>('o.amount_paise'), e2.val('0')).as('paid'))
        .whereRef('o.ref_id', '=', 'b.id')
        .where('o.ref_type', '=', 'BOOKING')
        .where('o.status', '=', 'PAID')
        .as('booking_paid'),
    )
    .select((eb) =>
      eb
        .selectFrom('app.bookings as nb')
        .select('nb.id')
        .whereRef('nb.renews_subscription_id', '=', 'sub.id')
        .where('nb.status', 'in', ['PENDING_PAYMENT', 'CONFIRMED', 'REVIEW_REQUIRED'])
        .limit(1)
        .as('renewal_id'),
    );
  if (f.id) q = q.where('b.id', '=', f.id);
  if (f.status) q = q.where('b.status', '=', f.status as BookingView['status']);
  if (f.communityId) q = q.where('b.community_id', '=', f.communityId);
  if (f.residentId) q = q.where('b.resident_id', '=', f.residentId);
  if (f.before) {
    const before = f.before;
    q = q.where((eb) => eb.or([eb('b.created_at', '<', new Date(before.at)), eb.and([eb('b.created_at', '=', new Date(before.at)), eb('b.id', '<', before.id)])]));
  }
  const rows = await q.orderBy('b.created_at', 'desc').orderBy('b.id', 'desc').limit(f.limit ?? 50).execute();

  return rows.map((r) => {
    const snap = r.plan_snapshot as { planName: string; selectionLabel: string };
    const total = Number(r.total_paise);
    const initial = r.mode === 'DEMAND_LED' ? Number(r.initial_paid_paise ?? 0) : 0;
    const paid = initial + Number(r.booking_paid ?? 0);
    return {
      id: r.id,
      reference: r.reference,
      mode: r.mode,
      status: r.status,
      planName: snap.planName,
      selectionLabel: snap.selectionLabel,
      slot: { label: r.slot_label, startTime: r.start_time.slice(0, 5), durationMinutes: r.duration_minutes, daysOfWeek: r.days_of_week },
      startDate: r.start_date,
      totalPaise: total,
      paidPaise: paid,
      outstandingPaise: Math.max(0, total - paid),
      balanceDueAt: r.mode === 'DEMAND_LED' && r.status === 'PENDING_PAYMENT' ? iso(r.balance_due_at) : null,
      subscription: r.sub_id
        ? {
            id: r.sub_id,
            periodStart: r.period_start!,
            periodEnd: r.period_end!,
            status: r.sub_status!,
            renewable: (r.sub_status === 'ACTIVE' || r.sub_status === 'PENDING_ACTIVATION') && !r.renewal_id,
          }
        : null,
      createdAt: iso(r.created_at)!,
      resident: { id: r.resident_id, fullName: r.full_name, phone: r.phone },
      flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
      version: r.version,
    };
  });
}
