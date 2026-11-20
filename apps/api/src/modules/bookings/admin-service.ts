import { sql } from 'kysely';
import type {
  AdminDemandRequest,
  AdminPayment,
  AllocateInput,
  ApproveRefundInput,
  CreateDemandCycleInput,
  CreateSlotSetInput,
  DemandCycle,
  DemandSummary,
  ExtendBalanceInput,
  PaymentException,
  Slot,
  SlotInput,
  SlotSet,
  UpdateDemandCycleInput,
  UpdateSlotInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, toPage } from '../../lib/pagination';
import { auditAdmin } from '../audit/audit';
import { visibleCommunity } from '../locations/scope';
import { slotUsage } from './payments';
import { bookingViews } from './views';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** ADM-08 demand/booking/payment status and ADM-10 slots. */
export class BookingAdminService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ------------------------------------------------------------------ pickers

  /** Communities in the admin's scope (for ADM-08/ADM-10 pickers). */
  async communityOptions(actor: AdminActor) {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.communities as c')
        .leftJoin('app.cluster_community_memberships as m', (j) => j.onRef('m.community_id', '=', 'c.id').on('m.effective_to', 'is', null))
        .select(['c.id', 'c.name', 'c.status', 'm.cluster_id'])
        .where('c.status', '!=', 'INACTIVE')
        .orderBy('c.name')
        .execute();
      return rows.filter((r) => inScope(actor, r.cluster_id)).map((r) => ({ id: r.id, name: r.name, status: r.status }));
    });
  }

  async publishedPlans(actor: AdminActor, communityId: string) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      return trx
        .selectFrom('app.plans as p')
        .innerJoin('app.catalogue_versions as v', 'v.id', 'p.catalogue_version_id')
        .select(['p.id', 'p.code', 'p.name', 'p.validity_days as validityDays'])
        .where('v.community_id', '=', communityId)
        .where('v.status', '=', 'PUBLISHED')
        .orderBy('p.sort')
        .orderBy('p.name')
        .execute();
    });
  }

  // ------------------------------------------------------------------ slots

  private async toSlots(trx: Tx, rows: Awaited<ReturnType<BookingAdminService['slotRows']>>): Promise<Slot[]> {
    const out: Slot[] = [];
    for (const s of rows) {
      out.push({
        id: s.id,
        communityId: s.community_id,
        mode: s.mode,
        slotSetId: s.slot_set_id,
        serviceId: s.service_id,
        serviceName: s.service_name,
        label: s.label,
        startTime: s.start_time.slice(0, 5),
        durationMinutes: s.duration_minutes,
        daysOfWeek: s.days_of_week,
        capacity: s.capacity,
        used: await slotUsage(trx, s.id, s.mode),
        status: s.status,
        version: s.version,
      });
    }
    return out;
  }

  private slotRows(trx: Tx, where: { communityId?: string; slotSetId?: string; id?: string }) {
    let q = trx.selectFrom('app.slots as s').leftJoin('app.services as sv', 'sv.id', 's.service_id').selectAll('s').select('sv.name as service_name');
    if (where.communityId) q = q.where('s.community_id', '=', where.communityId).where('s.mode', '=', 'CONTINUOUS');
    if (where.slotSetId) q = q.where('s.slot_set_id', '=', where.slotSetId);
    if (where.id) q = q.where('s.id', '=', where.id);
    return q.orderBy('s.start_time').orderBy('s.label').execute();
  }

  async listSlots(actor: AdminActor, communityId: string): Promise<Slot[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      return this.toSlots(trx, await this.slotRows(trx, { communityId }));
    });
  }

  private async assertService(trx: Tx, communityId: string, serviceId: string | null | undefined) {
    if (!serviceId) return;
    const cs = await trx.selectFrom('app.community_services').select('enabled').where('community_id', '=', communityId).where('service_id', '=', serviceId).executeTakeFirst();
    if (!cs?.enabled) throw businessRule('This service is not enabled for the community');
  }

  /** Continuous slot (created as DRAFT; publish to make it bookable). */
  async createSlot(actor: AdminActor, requestId: string, communityId: string, input: SlotInput): Promise<Slot[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      await this.assertService(trx, communityId, input.serviceId);
      const row = await trx
        .insertInto('app.slots')
        .values({
          community_id: communityId,
          mode: 'CONTINUOUS',
          service_id: input.serviceId ?? null,
          label: input.label,
          start_time: input.startTime,
          duration_minutes: input.durationMinutes,
          days_of_week: input.daysOfWeek,
          capacity: input.capacity,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await auditAdmin(trx, actor, requestId, { action: 'slot.created', targetType: 'slot', targetId: row.id, after: input });
      return this.toSlots(trx, await this.slotRows(trx, { communityId }));
    });
  }

  async updateSlot(actor: AdminActor, requestId: string, slotId: string, input: UpdateSlotInput): Promise<Slot> {
    return this.tx(actor, async (trx) => {
      const s = await trx.selectFrom('app.slots').selectAll().where('id', '=', slotId).forUpdate().executeTakeFirst();
      if (!s) throw notFound('Slot');
      await visibleCommunity(trx, actor, s.community_id);
      if (s.version !== input.version) throw versionConflict();
      if (s.slot_set_id) {
        const set = await trx.selectFrom('app.slot_sets').select('status').where('id', '=', s.slot_set_id).executeTakeFirstOrThrow();
        if (set.status !== 'DRAFT') throw businessRule('Slots in a published slot set cannot be changed');
        if (input.status) throw businessRule('Demand-led slots are published with their slot set');
      }
      const used = await slotUsage(trx, s.id, s.mode);
      if (input.capacity !== undefined && input.capacity < used) {
        throw businessRule(`Capacity cannot be lower than the ${used} household(s) already holding this slot`);
      }
      if (s.status === 'PUBLISHED' && (input.startTime || input.durationMinutes || input.daysOfWeek || input.serviceId !== undefined)) {
        // OPEN (ADM-08): changing a published slot after residents paid needs an approved policy.
        throw businessRule('A published slot’s time and service cannot be changed. Withdraw it and publish a new slot instead.');
      }
      if (input.status === 'DRAFT' && s.status !== 'DRAFT') throw businessRule('A published slot cannot go back to draft');
      await this.assertService(trx, s.community_id, input.serviceId);
      await trx
        .updateTable('app.slots')
        .set({
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.serviceId !== undefined ? { service_id: input.serviceId } : {}),
          ...(input.startTime !== undefined ? { start_time: input.startTime } : {}),
          ...(input.durationMinutes !== undefined ? { duration_minutes: input.durationMinutes } : {}),
          ...(input.daysOfWeek !== undefined ? { days_of_week: input.daysOfWeek } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', slotId)
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: input.status === 'PUBLISHED' ? 'slot.published' : input.status === 'WITHDRAWN' ? 'slot.withdrawn' : 'slot.updated',
        targetType: 'slot',
        targetId: slotId,
        before: { status: s.status, capacity: s.capacity, label: s.label },
        after: input,
      });
      return (await this.toSlots(trx, await this.slotRows(trx, { id: slotId })))[0]!;
    });
  }

  // ------------------------------------------------------------------ demand cycles

  private async cycleRows(trx: Tx, where: { communityId?: string | undefined; id?: string }) {
    let q = trx
      .selectFrom('app.demand_cycles as d')
      .innerJoin('app.communities as c', 'c.id', 'd.community_id')
      .selectAll('d')
      .select('c.name as community_name')
      .select((eb) =>
        eb
          .selectFrom('app.demand_requests as r')
          .select((e2) => e2.fn.countAll<string>().as('n'))
          .whereRef('r.cycle_id', '=', 'd.id')
          .where('r.status', 'in', ['COMMITTED', 'BALANCE_DUE', 'CONVERTED'])
          .as('committed'),
      );
    if (where.communityId) q = q.where('d.community_id', '=', where.communityId);
    if (where.id) q = q.where('d.id', '=', where.id);
    const rows = await q.orderBy('d.opens_at', 'desc').limit(100).execute();
    const plans = rows.length ? await trx.selectFrom('app.demand_cycle_plans').selectAll().where('cycle_id', 'in', rows.map((r) => r.id)).execute() : [];
    return rows.map(
      (d): DemandCycle => ({
        id: d.id,
        communityId: d.community_id,
        communityName: d.community_name,
        name: d.name,
        opensAt: iso(d.opens_at)!,
        closesAt: iso(d.closes_at)!,
        initialPct: d.initial_pct,
        status: d.status,
        planIds: plans.filter((p) => p.cycle_id === d.id).map((p) => p.plan_id),
        publishedAt: iso(d.published_at),
        committedCount: Number(d.committed ?? 0),
        version: d.version,
      }),
    );
  }

  private async scopedCycle(trx: Tx, actor: AdminActor, id: string, lock = false) {
    let q = trx.selectFrom('app.demand_cycles').selectAll().where('id', '=', id);
    if (lock) q = q.forUpdate();
    const c = await q.executeTakeFirst();
    if (!c) throw notFound('Demand cycle');
    await visibleCommunity(trx, actor, c.community_id);
    return c;
  }

  async listCycles(actor: AdminActor, communityId: string): Promise<DemandCycle[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      return this.cycleRows(trx, { communityId });
    });
  }

  async getCycle(actor: AdminActor, id: string): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      await this.scopedCycle(trx, actor, id);
      return (await this.cycleRows(trx, { id }))[0]!;
    });
  }

  private async assertPlans(trx: Tx, communityId: string, planIds: string[]) {
    if (planIds.length === 0) return;
    const rows = await trx
      .selectFrom('app.plans as p')
      .innerJoin('app.catalogue_versions as v', 'v.id', 'p.catalogue_version_id')
      .select(['p.id', 'v.community_id', 'v.status'])
      .where('p.id', 'in', planIds)
      .execute();
    if (rows.length !== new Set(planIds).size || rows.some((r) => r.community_id !== communityId || r.status !== 'PUBLISHED')) {
      throw businessRule('Choose plans from the community’s published catalogue');
    }
  }

  async createCycle(actor: AdminActor, requestId: string, communityId: string, input: CreateDemandCycleInput): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      if (new Date(input.closesAt) <= new Date(input.opensAt)) throw businessRule('The cycle must close after it opens');
      await this.assertPlans(trx, communityId, input.planIds);
      const row = await trx
        .insertInto('app.demand_cycles')
        .values({ community_id: communityId, name: input.name, opens_at: input.opensAt, closes_at: input.closesAt, initial_pct: input.initialPct ?? null })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (input.planIds.length) await trx.insertInto('app.demand_cycle_plans').values([...new Set(input.planIds)].map((p) => ({ cycle_id: row.id, plan_id: p }))).execute();
      await auditAdmin(trx, actor, requestId, { action: 'demand_cycle.created', targetType: 'demand_cycle', targetId: row.id, after: input });
      return (await this.cycleRows(trx, { id: row.id }))[0]!;
    });
  }

  async updateCycle(actor: AdminActor, requestId: string, id: string, input: UpdateDemandCycleInput): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      const c = await this.scopedCycle(trx, actor, id, true);
      if (c.version !== input.version) throw versionConflict();
      if (c.status !== 'DRAFT') throw businessRule('Only a draft cycle can be edited');
      const opens = input.opensAt ?? iso(c.opens_at)!;
      const closes = input.closesAt ?? iso(c.closes_at)!;
      if (new Date(closes) <= new Date(opens)) throw businessRule('The cycle must close after it opens');
      if (input.planIds) {
        await this.assertPlans(trx, c.community_id, input.planIds);
        await trx.deleteFrom('app.demand_cycle_plans').where('cycle_id', '=', id).execute();
        if (input.planIds.length) await trx.insertInto('app.demand_cycle_plans').values([...new Set(input.planIds)].map((p) => ({ cycle_id: id, plan_id: p }))).execute();
      }
      await trx
        .updateTable('app.demand_cycles')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          opens_at: opens,
          closes_at: closes,
          ...(input.initialPct !== undefined ? { initial_pct: input.initialPct } : {}),
        })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'demand_cycle.updated', targetType: 'demand_cycle', targetId: id, after: input });
      return (await this.cycleRows(trx, { id }))[0]!;
    });
  }

  /** Validates and publishes; the initial percentage and catalogue are locked (RES-07B). */
  async publishCycle(actor: AdminActor, requestId: string, id: string, version: number): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      const c = await this.scopedCycle(trx, actor, id, true);
      if (c.version !== version) throw versionConflict();
      if (c.status !== 'DRAFT') throw businessRule('This cycle is already published');
      const problems: string[] = [];
      if (c.initial_pct === null) problems.push('set the initial payment percentage (1–99)');
      if (new Date(c.closes_at) <= new Date()) problems.push('move the closing time into the future');
      const community = await trx.selectFrom('app.communities').select('status').where('id', '=', c.community_id).executeTakeFirstOrThrow();
      if (community.status !== 'ACTIVE') problems.push('activate the community first');
      const version_ = await trx
        .selectFrom('app.catalogue_versions')
        .select('id')
        .where('community_id', '=', c.community_id)
        .where('status', '=', 'PUBLISHED')
        .executeTakeFirst();
      if (!version_) problems.push('publish the community’s catalogue first');
      const plans = await trx
        .selectFrom('app.demand_cycle_plans as dp')
        .innerJoin('app.plans as p', 'p.id', 'dp.plan_id')
        .select(['p.catalogue_version_id'])
        .where('dp.cycle_id', '=', id)
        .execute();
      if (plans.length === 0) problems.push('choose at least one eligible plan');
      if (version_ && plans.some((p) => p.catalogue_version_id !== version_.id)) problems.push('re-select plans: the catalogue was republished');
      if (problems.length) throw businessRule(`Before publishing: ${problems.join('; ')}.`);

      await trx
        .updateTable('app.demand_cycles')
        .set({ status: 'PUBLISHED', catalogue_version_id: version_!.id, published_by: actor.id, published_at: sql`now()` })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'demand_cycle.published',
        targetType: 'demand_cycle',
        targetId: id,
        after: { initialPct: c.initial_pct, catalogueVersionId: version_!.id, opensAt: c.opens_at, closesAt: c.closes_at },
      });
      return (await this.cycleRows(trx, { id }))[0]!;
    });
  }

  async closeCycle(actor: AdminActor, requestId: string, id: string, version: number): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      const c = await this.scopedCycle(trx, actor, id, true);
      if (c.version !== version) throw versionConflict();
      if (c.status === 'DRAFT') {
        await trx.updateTable('app.demand_cycles').set({ status: 'CANCELLED' }).where('id', '=', id).execute();
      } else if (c.status === 'PUBLISHED') {
        await trx.updateTable('app.demand_cycles').set({ status: 'CLOSED', closed_at: sql`now()`, closes_at: sql`least(closes_at, now())` }).where('id', '=', id).execute();
        await trx
          .updateTable('app.demand_requests')
          .set({ status: 'CANCELLED', ended_at: sql`now()`, end_reason: 'The demand cycle closed before the initial payment' })
          .where('cycle_id', '=', id)
          .where('status', '=', 'AWAITING_PAYMENT')
          .execute();
      } else {
        throw businessRule('This cycle is already closed');
      }
      await auditAdmin(trx, actor, requestId, { action: c.status === 'DRAFT' ? 'demand_cycle.cancelled' : 'demand_cycle.closed', targetType: 'demand_cycle', targetId: id });
      return (await this.cycleRows(trx, { id }))[0]!;
    });
  }

  async extendCycle(actor: AdminActor, requestId: string, id: string, input: { closesAt: string; reason: string; version: number }): Promise<DemandCycle> {
    return this.tx(actor, async (trx) => {
      const c = await this.scopedCycle(trx, actor, id, true);
      if (c.version !== input.version) throw versionConflict();
      if (c.status !== 'PUBLISHED') throw businessRule('Only an open cycle can be extended');
      if (new Date(input.closesAt) <= new Date(c.closes_at)) throw businessRule('The new closing time must be later than the current one');
      await trx.updateTable('app.demand_cycles').set({ closes_at: input.closesAt }).where('id', '=', id).execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'demand_cycle.extended', targetType: 'demand_cycle', targetId: id, reason: input.reason, before: { closesAt: c.closes_at }, after: { closesAt: input.closesAt },
      });
      return (await this.cycleRows(trx, { id }))[0]!;
    });
  }

  async summary(actor: AdminActor, id: string): Promise<DemandSummary> {
    return this.tx(actor, async (trx) => {
      await this.scopedCycle(trx, actor, id);
      const counts = await trx
        .selectFrom('app.demand_requests')
        .select(['status'])
        .select((eb) => [eb.fn.countAll<string>().as('n'), eb.fn.coalesce(eb.fn.sum<string>('initial_paid_paise'), sql<string>`0`).as('paid')])
        .where('cycle_id', '=', id)
        .groupBy('status')
        .execute();
      const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
      const verified = await trx
        .selectFrom('app.demand_requests as r')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'r.terms_snapshot_id')
        .select(['r.id', 't.plan_snapshot'])
        .where('r.cycle_id', '=', id)
        .where('r.status', 'in', ['COMMITTED', 'BALANCE_DUE', 'CONVERTED'])
        .execute();
      const bySel = new Map<string, { planName: string; selectionLabel: string; count: number }>();
      for (const v of verified) {
        const s = v.plan_snapshot as { planName: string; selectionLabel: string };
        const key = `${s.planName}|${s.selectionLabel}`;
        const cur = bySel.get(key) ?? { planName: s.planName, selectionLabel: s.selectionLabel, count: 0 };
        cur.count++;
        bySel.set(key, cur);
      }
      const prefs = verified.length
        ? await trx
            .selectFrom('app.demand_request_preferences as p')
            .innerJoin('app.time_windows as w', 'w.id', 'p.time_window_id')
            .select(['w.name', 'p.rank'])
            .where('p.request_id', 'in', verified.map((v) => v.id))
            .execute()
        : [];
      const byWin = new Map<string, { windowName: string; firstChoice: number; anyChoice: number }>();
      for (const p of prefs) {
        const cur = byWin.get(p.name) ?? { windowName: p.name, firstChoice: 0, anyChoice: 0 };
        cur.anyChoice++;
        if (p.rank === 1) cur.firstChoice++;
        byWin.set(p.name, cur);
      }
      return {
        cycleId: id,
        totals: {
          awaitingPayment: n('AWAITING_PAYMENT'),
          committed: n('COMMITTED'),
          balanceDue: n('BALANCE_DUE'),
          converted: n('CONVERTED'),
          expired: n('EXPIRED'),
          reviewRequired: n('REVIEW_REQUIRED'),
          initialCollectedPaise: counts.filter((c) => c.status !== 'AWAITING_PAYMENT' && c.status !== 'CANCELLED').reduce((s, c) => s + Number(c.paid), 0),
        },
        bySelection: [...bySel.values()].sort((a, b) => b.count - a.count),
        byPreferredWindow: [...byWin.values()].sort((a, b) => b.firstChoice - a.firstChoice),
      };
    });
  }

  async demandRequests(actor: AdminActor, cycleId: string, status?: string): Promise<AdminDemandRequest[]> {
    return this.tx(actor, async (trx) => {
      await this.scopedCycle(trx, actor, cycleId);
      let q = trx
        .selectFrom('app.demand_requests as r')
        .innerJoin('app.booking_terms_snapshots as t', 't.id', 'r.terms_snapshot_id')
        .innerJoin('app.resident_profiles as p', 'p.id', 'r.resident_id')
        .innerJoin('app.flats as f', 'f.id', 'r.flat_id')
        .innerJoin('app.towers as tw', 'tw.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'r.community_id')
        .select([
          'r.id', 'r.reference', 'r.status', 'r.initial_paid_paise', 'r.allocated_slot_id', 'r.created_at', 'r.resident_id',
          't.plan_snapshot', 't.total_paise', 't.remaining_due_paise', 'p.full_name', 'p.phone', 'f.flat_number', 'tw.name as tower_name', 'c.name as community_name',
        ])
        .where('r.cycle_id', '=', cycleId);
      if (status) q = q.where('r.status', '=', status as AdminDemandRequest['status']);
      const rows = await q.orderBy('r.created_at').limit(1000).execute();
      const prefs = rows.length
        ? await trx
            .selectFrom('app.demand_request_preferences as p')
            .innerJoin('app.time_windows as w', 'w.id', 'p.time_window_id')
            .select(['p.request_id', 'w.name'])
            .where('p.request_id', 'in', rows.map((r) => r.id))
            .orderBy('p.rank')
            .execute()
        : [];
      return rows.map((r) => {
        const s = r.plan_snapshot as { planName: string; selectionLabel: string };
        return {
          id: r.id,
          reference: r.reference,
          status: r.status,
          resident: { id: r.resident_id, fullName: r.full_name, phone: r.phone },
          flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
          planName: s.planName,
          selectionLabel: s.selectionLabel,
          totalPaise: Number(r.total_paise),
          initialPaidPaise: Number(r.initial_paid_paise),
          remainingDuePaise: Number(r.remaining_due_paise),
          preferredWindows: prefs.filter((p) => p.request_id === r.id).map((p) => p.name),
          allocatedSlotId: r.allocated_slot_id,
          createdAt: iso(r.created_at)!,
        };
      });
    });
  }

  // ------------------------------------------------------------------ slot sets (demand-led)

  private async loadSet(trx: Tx, setId: string): Promise<SlotSet> {
    const s = await trx.selectFrom('app.slot_sets').selectAll().where('id', '=', setId).executeTakeFirstOrThrow();
    return {
      id: s.id,
      cycleId: s.cycle_id,
      status: s.status,
      commencementDate: s.commencement_date,
      balanceDueAt: iso(s.balance_due_at)!,
      publishedAt: iso(s.published_at),
      slots: await this.toSlots(trx, await this.slotRows(trx, { slotSetId: s.id })),
      version: s.version,
    };
  }

  async slotSets(actor: AdminActor, cycleId: string): Promise<SlotSet[]> {
    return this.tx(actor, async (trx) => {
      await this.scopedCycle(trx, actor, cycleId);
      const sets = await trx.selectFrom('app.slot_sets').select('id').where('cycle_id', '=', cycleId).orderBy('created_at', 'desc').execute();
      const out: SlotSet[] = [];
      for (const s of sets) out.push(await this.loadSet(trx, s.id));
      return out;
    });
  }

  async createSlotSet(actor: AdminActor, requestId: string, cycleId: string, input: CreateSlotSetInput): Promise<SlotSet> {
    return this.tx(actor, async (trx) => {
      const c = await this.scopedCycle(trx, actor, cycleId, true);
      if (!['PUBLISHED', 'CLOSED'].includes(c.status)) throw businessRule('Slots can be prepared once the cycle is published');
      const draft = await trx.selectFrom('app.slot_sets').select('id').where('cycle_id', '=', cycleId).where('status', '=', 'DRAFT').executeTakeFirst();
      if (draft) throw businessRule('This cycle already has a draft slot set');
      this.assertDates(input.commencementDate, input.balanceDueAt);
      const row = await trx
        .insertInto('app.slot_sets')
        .values({ cycle_id: cycleId, commencement_date: input.commencementDate, balance_due_at: input.balanceDueAt })
        .returning('id')
        .executeTakeFirstOrThrow();
      await auditAdmin(trx, actor, requestId, { action: 'slot_set.created', targetType: 'slot_set', targetId: row.id, after: input });
      return this.loadSet(trx, row.id);
    });
  }

  private assertDates(commencementDate: string, balanceDueAt: string) {
    if (new Date(balanceDueAt) <= new Date()) throw businessRule('The balance deadline must be in the future');
    // RES-07C: balance is due before service begins.
    if (new Date(balanceDueAt) >= new Date(`${commencementDate}T00:00:00+05:30`)) throw businessRule('The balance deadline must be before the commencement date');
  }

  private async draftSet(trx: Tx, actor: AdminActor, setId: string) {
    const set = await trx.selectFrom('app.slot_sets').selectAll().where('id', '=', setId).forUpdate().executeTakeFirst();
    if (!set) throw notFound('Slot set');
    const cycle = await this.scopedCycle(trx, actor, set.cycle_id);
    return { set, cycle };
  }

  async addSetSlot(actor: AdminActor, requestId: string, setId: string, input: SlotInput): Promise<SlotSet> {
    return this.tx(actor, async (trx) => {
      const { set, cycle } = await this.draftSet(trx, actor, setId);
      if (set.status !== 'DRAFT') throw businessRule('Only a draft slot set can be changed');
      await this.assertService(trx, cycle.community_id, input.serviceId);
      const row = await trx
        .insertInto('app.slots')
        .values({
          community_id: cycle.community_id,
          mode: 'DEMAND_LED',
          slot_set_id: setId,
          service_id: input.serviceId ?? null,
          label: input.label,
          start_time: input.startTime,
          duration_minutes: input.durationMinutes,
          days_of_week: input.daysOfWeek,
          capacity: input.capacity,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await auditAdmin(trx, actor, requestId, { action: 'slot.created', targetType: 'slot', targetId: row.id, after: { ...input, slotSetId: setId } });
      return this.loadSet(trx, setId);
    });
  }

  /** Assigns committed requests to slots of the draft set; capacity enforced here (ADR-013). */
  async allocate(actor: AdminActor, requestId: string, setId: string, input: AllocateInput): Promise<SlotSet> {
    return this.tx(actor, async (trx) => {
      const { set } = await this.draftSet(trx, actor, setId);
      if (set.status !== 'DRAFT') throw businessRule('Only a draft slot set can be changed');
      const slots = await trx.selectFrom('app.slots').select(['id', 'capacity', 'label']).where('slot_set_id', '=', setId).forUpdate().execute();
      const slotIds = new Set(slots.map((s) => s.id));
      for (const a of input.allocations) {
        if (a.slotId && !slotIds.has(a.slotId)) throw businessRule('Allocate only to slots in this slot set');
        const r = await trx
          .updateTable('app.demand_requests')
          .set({ allocated_slot_id: a.slotId })
          .where('id', '=', a.requestId)
          .where('cycle_id', '=', set.cycle_id)
          .where('status', '=', 'COMMITTED')
          .executeTakeFirst();
        if (r.numUpdatedRows === 0n) throw businessRule('Only paid commitments in this cycle can be allocated');
      }
      for (const s of slots) {
        const used = await slotUsage(trx, s.id, 'DEMAND_LED');
        if (used > s.capacity) throw businessRule(`Slot “${s.label}” has capacity ${s.capacity}; ${used} households are allocated`);
      }
      await auditAdmin(trx, actor, requestId, { action: 'slot_set.allocated', targetType: 'slot_set', targetId: setId, after: { allocations: input.allocations.length } });
      return this.loadSet(trx, setId);
    });
  }

  /**
   * Admin approval + publication (RES-07C): allocated commitments become
   * BALANCE_DUE with a booking awaiting the remaining balance.
   */
  async publishSlotSet(actor: AdminActor, requestId: string, setId: string, version: number): Promise<SlotSet> {
    return this.tx(actor, async (trx) => {
      const { set, cycle } = await this.draftSet(trx, actor, setId);
      if (set.version !== version) throw versionConflict();
      if (set.status !== 'DRAFT') throw businessRule('This slot set is already published');
      this.assertDates(set.commencement_date, iso(set.balance_due_at)!);
      const slots = await trx.selectFrom('app.slots').select(['id', 'start_time']).where('slot_set_id', '=', setId).execute();
      if (slots.length === 0) throw businessRule('Add at least one slot before publishing');
      const allocated = await trx
        .selectFrom('app.demand_requests')
        .select(['id', 'resident_id', 'membership_id', 'flat_id', 'community_id', 'cluster_id', 'terms_snapshot_id', 'allocated_slot_id'])
        .where('cycle_id', '=', cycle.id)
        .where('status', '=', 'COMMITTED')
        .where('allocated_slot_id', 'in', slots.map((s) => s.id))
        .execute();
      if (allocated.length === 0) throw businessRule('Allocate at least one paid commitment before publishing');
      for (const r of allocated) {
        await trx
          .insertInto('app.bookings')
          .values({
            mode: 'DEMAND_LED',
            demand_request_id: r.id,
            resident_id: r.resident_id,
            membership_id: r.membership_id,
            flat_id: r.flat_id,
            community_id: r.community_id,
            cluster_id: r.cluster_id,
            terms_snapshot_id: r.terms_snapshot_id,
            slot_id: r.allocated_slot_id!,
            start_date: set.commencement_date,
          })
          .execute();
        await trx.updateTable('app.demand_requests').set({ status: 'BALANCE_DUE' }).where('id', '=', r.id).execute();
      }
      await trx.updateTable('app.slots').set({ status: 'PUBLISHED' }).where('slot_set_id', '=', setId).execute();
      await trx.updateTable('app.slot_sets').set({ status: 'PUBLISHED', published_by: actor.id, published_at: sql`now()` }).where('id', '=', setId).execute();
      await trx.updateTable('app.demand_cycles').set({ status: 'SLOTS_PUBLISHED' }).where('id', '=', cycle.id).where('status', 'in', ['PUBLISHED', 'CLOSED']).execute();
      // Notify residents (delivered by the notification worker in Phase 7).
      await trx
        .insertInto('app.notification_outbox')
        .values(
          allocated.map((r) => ({
            event_type: 'demand.slot_published',
            dedupe_key: `slot_published:${r.id}`,
            channel: 'PUSH' as const,
            recipient: r.resident_id,
            payload: JSON.stringify({ demandRequestId: r.id, commencementDate: set.commencement_date, balanceDueAt: iso(set.balance_due_at) }),
          })),
        )
        .onConflict((oc) => oc.column('dedupe_key').doNothing())
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'slot_set.published',
        targetType: 'slot_set',
        targetId: setId,
        after: { commencementDate: set.commencement_date, balanceDueAt: set.balance_due_at, bookings: allocated.length },
      });
      return this.loadSet(trx, setId);
    });
  }

  /** ADR-013: a deadline may be extended before it passes, with a reason. */
  async extendBalance(actor: AdminActor, requestId: string, setId: string, input: ExtendBalanceInput): Promise<SlotSet> {
    return this.tx(actor, async (trx) => {
      const { set } = await this.draftSet(trx, actor, setId);
      if (set.version !== input.version) throw versionConflict();
      if (set.status !== 'PUBLISHED') throw businessRule('Only a published slot set has a balance deadline to extend');
      if (new Date(set.balance_due_at) <= new Date()) throw businessRule('The deadline has already passed and cannot be extended');
      if (new Date(input.balanceDueAt) <= new Date(set.balance_due_at)) throw businessRule('The new deadline must be later than the current one');
      if (new Date(input.balanceDueAt) >= new Date(`${set.commencement_date}T00:00:00+05:30`)) throw businessRule('The balance deadline must be before the commencement date');
      await trx.updateTable('app.slot_sets').set({ balance_due_at: input.balanceDueAt }).where('id', '=', setId).execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'slot_set.deadline_extended', targetType: 'slot_set', targetId: setId, reason: input.reason, before: { balanceDueAt: set.balance_due_at }, after: { balanceDueAt: input.balanceDueAt },
      });
      return this.loadSet(trx, setId);
    });
  }

  // ------------------------------------------------------------------ bookings & payments

  async bookings(actor: AdminActor, p: { limit: number; cursor?: string | undefined; status?: string | undefined; communityId?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      if (p.communityId) await visibleCommunity(trx, actor, p.communityId);
      const c = decodeCursor(p.cursor);
      const rows = await bookingViews(trx, { status: p.status, communityId: p.communityId, limit: p.limit + 1, before: c ? { at: c.v, id: c.id } : undefined });
      const page = toPage(rows, p.limit, (r) => ({ v: r.createdAt, id: r.id }));
      return page;
    });
  }

  /** Manual reminder (ADM-08): queues a message; never changes payment state. */
  async remind(actor: AdminActor, requestId: string, bookingId: string) {
    return this.tx(actor, async (trx) => {
      const b = await trx.selectFrom('app.bookings').select(['id', 'status', 'resident_id']).where('id', '=', bookingId).executeTakeFirst();
      if (!b) throw notFound('Booking');
      if (b.status !== 'PENDING_PAYMENT') throw businessRule('Only a booking waiting for payment needs a reminder');
      const day = new Date().toISOString().slice(0, 10);
      const r = await trx
        .insertInto('app.notification_outbox')
        .values({ event_type: 'payment.reminder', dedupe_key: `payment_reminder:${bookingId}:${day}`, channel: 'PUSH', recipient: b.resident_id, payload: JSON.stringify({ bookingId }) })
        .onConflict((oc) => oc.column('dedupe_key').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!r) throw businessRule('A reminder was already sent today');
      await auditAdmin(trx, actor, requestId, { action: 'payment.reminder_sent', targetType: 'booking', targetId: bookingId });
      return { queued: true };
    });
  }

  async payments(actor: AdminActor, p: { limit: number; cursor?: string | undefined; status?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      const c = decodeCursor(p.cursor);
      let q = trx
        .selectFrom('app.payment_orders as o')
        .innerJoin('app.resident_profiles as r', 'r.id', 'o.resident_id')
        .leftJoin('app.demand_requests as dr', (j) => j.onRef('dr.id', '=', 'o.ref_id').on('o.ref_type', '=', 'DEMAND_REQUEST'))
        .leftJoin('app.bookings as bk', (j) => j.onRef('bk.id', '=', 'o.ref_id').on('o.ref_type', '=', 'BOOKING'))
        .selectAll('o')
        .select(['r.full_name', 'r.phone', 'dr.reference as dr_ref', 'bk.reference as bk_ref']);
      if (p.status) q = q.where('o.status', '=', p.status as AdminPayment['status']);
      if (c) q = q.where((eb) => eb.or([eb('o.created_at', '<', new Date(c.v)), eb.and([eb('o.created_at', '=', new Date(c.v)), eb('o.id', '<', c.id)])]));
      const rows = await q.orderBy('o.created_at', 'desc').orderBy('o.id', 'desc').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: iso(r.created_at)!, id: r.id }));
      const ids = page.items.map((o) => o.id);
      const txs = ids.length ? await trx.selectFrom('app.payment_transactions').selectAll().where('order_id', 'in', ids).orderBy('verified_at').execute() : [];
      const refunds = txs.length
        ? await trx
            .selectFrom('app.refund_records')
            .select(['transaction_id'])
            .select((eb) => eb.fn.sum<string>('amount_paise').as('total'))
            .where('transaction_id', 'in', txs.map((t) => t.id))
            .where('status', '=', 'PROCESSED')
            .groupBy('transaction_id')
            .execute()
        : [];
      const items: AdminPayment[] = page.items.map((o) => {
        const t = txs.find((x) => x.order_id === o.id);
        return {
          id: o.id,
          purpose: o.purpose,
          refType: o.ref_type,
          refId: o.ref_id,
          reference: o.dr_ref ?? o.bk_ref ?? null,
          amountPaise: Number(o.amount_paise),
          status: o.status,
          resident: { id: o.resident_id, fullName: o.full_name, phone: o.phone },
          providerOrderId: o.provider_order_id,
          transaction: t
            ? {
                id: t.id,
                providerPaymentId: t.provider_payment_id,
                amountPaise: Number(t.amount_paise),
                method: t.method,
                status: t.status,
                refundedPaise: Number(refunds.find((r) => r.transaction_id === t.id)?.total ?? 0),
                verifiedAt: iso(t.verified_at)!,
              }
            : null,
          createdAt: iso(o.created_at)!,
        };
      });
      return { items, nextCursor: page.nextCursor };
    });
  }

  async exceptions(actor: AdminActor, status: 'OPEN' | 'RESOLVED'): Promise<PaymentException[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.payment_exceptions as e')
        .leftJoin('app.payment_orders as o', 'o.id', 'e.order_id')
        .leftJoin('app.payment_transactions as t', 't.id', 'e.transaction_id')
        .leftJoin('app.resident_profiles as r', 'r.id', 'o.resident_id')
        .selectAll('e')
        .select(['t.amount_paise', 'r.full_name', 'r.phone'])
        .where('e.status', '=', status)
        .orderBy('e.created_at', 'desc')
        .limit(200)
        .execute();
      return rows.map((e) => ({
        id: e.id,
        reasonCode: e.reason_code,
        detail: e.detail,
        status: e.status,
        paymentOrderId: e.order_id,
        transactionId: e.transaction_id,
        amountPaise: e.amount_paise === null ? null : Number(e.amount_paise),
        resident: e.phone ? { fullName: e.full_name, phone: e.phone } : null,
        resolutionNote: e.resolution_note,
        createdAt: iso(e.created_at)!,
        resolvedAt: iso(e.resolved_at),
      }));
    });
  }

  async resolveException(actor: AdminActor, requestId: string, id: string, note: string) {
    return this.tx(actor, async (trx) => {
      const r = await trx
        .updateTable('app.payment_exceptions')
        .set({ status: 'RESOLVED', resolution_note: note, resolved_by: actor.id, resolved_at: sql`now()` })
        .where('id', '=', id)
        .where('status', '=', 'OPEN')
        .returning('id')
        .executeTakeFirst();
      if (!r) throw notFound('Open exception');
      await auditAdmin(trx, actor, requestId, { action: 'payment_exception.resolved', targetType: 'payment_exception', targetId: id, reason: note });
      return { status: 'RESOLVED' as const };
    });
  }

  /** ADR-013: approve a refund (reason required). It is issued in the Razorpay dashboard. */
  async approveRefund(actor: AdminActor, requestId: string, transactionId: string, input: ApproveRefundInput) {
    return this.tx(actor, async (trx) => {
      const t = await trx.selectFrom('app.payment_transactions').selectAll().where('id', '=', transactionId).forUpdate().executeTakeFirst();
      if (!t) throw notFound('Payment');
      const already = await trx
        .selectFrom('app.refund_records')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount_paise'), sql<string>`0`).as('total'))
        .where('transaction_id', '=', t.id)
        .executeTakeFirstOrThrow();
      if (Number(already.total) + input.amountPaise > Number(t.amount_paise)) {
        throw businessRule('The refund cannot be more than the amount still refundable on this payment');
      }
      const r = await trx
        .insertInto('app.refund_records')
        .values({ transaction_id: t.id, cluster_id: t.cluster_id, amount_paise: input.amountPaise, reason: input.reason, approved_by: actor.id, approved_at: new Date() })
        .returning('id')
        .executeTakeFirstOrThrow();
      await auditAdmin(trx, actor, requestId, {
        action: 'refund.approved', targetType: 'payment_transaction', targetId: t.id, reason: input.reason, after: { refundId: r.id, amountPaise: input.amountPaise },
      });
      return { refundId: r.id, status: 'APPROVED' as const, providerPaymentId: t.provider_payment_id };
    });
  }

  async getSettings() {
    const r = await withTx(this.db, { userId: null, actorKind: 'system', isSuperAdmin: false, clusterIds: [] }, (trx) =>
      trx.selectFrom('app.app_settings').select('value').where('key', '=', 'booking_window_days').executeTakeFirst(),
    );
    return { bookingWindowDays: Number(r?.value ?? 14) };
  }

  async setSettings(actor: AdminActor, requestId: string, input: { bookingWindowDays: number }) {
    return this.tx(actor, async (trx) => {
      await trx.updateTable('app.app_settings').set({ value: JSON.stringify(input.bookingWindowDays), updated_by: actor.id, updated_at: sql`now()` }).where('key', '=', 'booking_window_days').execute();
      await auditAdmin(trx, actor, requestId, { action: 'settings.updated', targetType: 'app_settings', targetId: null, after: input });
      return input;
    });
  }
}
