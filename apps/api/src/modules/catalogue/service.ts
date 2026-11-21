import { sql } from 'kysely';
import type {
  CatalogueIssue,
  CatalogueValidation,
  CatalogueVersionDetail,
  CatalogueVersionSummary,
  CommunityServices,
  CreateDraftInput,
  CreateResidenceCategoryInput,
  CreateServiceTaskInput,
  CreateTimeWindowInput,
  Plan,
  PlanComponent,
  PublishCatalogueInput,
  PutPriceMatrixInput,
  ResidenceCategory,
  ServiceTask,
  TimeWindow,
  UpdateCommunityServicesInput,
  UpdateResidenceCategoryInput,
  UpdateServiceTaskInput,
  UpdateTimeWindowInput,
  UpsertComponentInput,
  UpsertPlanInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, fromPgError, notFound, versionConflict } from '../../lib/errors';
import { auditAdmin } from '../audit/audit';
import { visibleCommunity } from '../locations/scope';

/*
 * Per-community catalogue & pricing (ADM-07, ADR-009). All reads and writes are
 * scoped through the community (cluster scope). Only DRAFT catalogue versions
 * change; the database enforces this too (tg_catalogue_draft_only).
 */

const UNIQUE_FIELDS = {
  residence_categories_code_uq: { path: 'code', message: 'This category code already exists in this community' },
  time_windows_name_uq: { path: 'name', message: 'A time window with this name already exists' },
  service_tasks_name_uq: { path: 'name', message: 'This task already exists for this service' },
  plans_code_uq: { path: 'code', message: 'This plan code is already used in this version' },
  plan_components_service_uq: { path: 'serviceId', message: 'This service is already part of the plan' },
  catalogue_one_draft: { path: 'draft', message: 'A draft already exists for this community' },
};
const mapPg = (err: unknown): never => {
  throw fromPgError(err, UNIQUE_FIELDS) ?? err;
};

const hhmm = (t: string) => t.slice(0, 5);
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export class CatalogueService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ------------------------------------------------------------- services

  async getServices(actor: AdminActor, communityId: string): Promise<CommunityServices> {
    return this.tx(actor, async (trx) => {
      const community = await visibleCommunity(trx, actor, communityId);
      return this.loadServices(trx, communityId, community.defaultOperatingMode);
    });
  }

  private async loadServices(trx: Tx, communityId: string, defaultMode: CommunityServices['defaultOperatingMode']) {
    const rows = await trx
      .selectFrom('app.services as s')
      .leftJoin('app.community_services as cs', (j) =>
        j.onRef('cs.service_id', '=', 's.id').on('cs.community_id', '=', communityId),
      )
      .select(['s.id', 's.code', 's.name', 'cs.enabled', 'cs.operating_mode'])
      .orderBy('s.sort')
      .execute();
    return {
      defaultOperatingMode: defaultMode,
      services: rows.map((r) => ({
        serviceId: r.id,
        code: r.code,
        name: r.name,
        enabled: r.enabled ?? false,
        operatingMode: r.operating_mode ?? null,
        effectiveMode: r.enabled ? (r.operating_mode ?? defaultMode) : null,
      })),
    };
  }

  async putServices(actor: AdminActor, requestId: string, communityId: string, input: UpdateCommunityServicesInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId, { lock: true });
      const before = await this.loadServices(
        trx,
        communityId,
        (await trx.selectFrom('app.communities').select('default_operating_mode').where('id', '=', communityId).executeTakeFirstOrThrow())
          .default_operating_mode,
      );
      const known = new Set(before.services.map((s) => s.serviceId));
      for (const s of input.services) if (!known.has(s.serviceId)) throw notFound('Service');

      await trx
        .updateTable('app.communities')
        .set({ default_operating_mode: input.defaultOperatingMode })
        .where('id', '=', communityId)
        .execute();
      for (const s of input.services) {
        await trx
          .insertInto('app.community_services')
          .values({ community_id: communityId, service_id: s.serviceId, enabled: s.enabled, operating_mode: s.operatingMode })
          .onConflict((oc) =>
            oc.columns(['community_id', 'service_id']).doUpdateSet({ enabled: s.enabled, operating_mode: s.operatingMode }),
          )
          .execute();
      }
      const after = await this.loadServices(trx, communityId, input.defaultOperatingMode);
      for (const s of after.services) {
        if (s.enabled && !s.effectiveMode) {
          throw businessRule(`Choose an operating mode for ${s.name}, or set a community default`);
        }
      }
      await auditAdmin(trx, actor, requestId, {
        action: 'community.services_updated',
        targetType: 'community',
        targetId: communityId,
        before,
        after,
      });
      return after;
    });
  }

  // --------------------------------------------------- residence categories

  async listCategories(actor: AdminActor, communityId: string): Promise<ResidenceCategory[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const rows = await trx
        .selectFrom('app.residence_categories as rc')
        .selectAll('rc')
        .select((eb) =>
          eb
            .selectFrom('app.flats as f')
            .whereRef('f.residence_category_id', '=', 'rc.id')
            .where('f.status', '=', 'ACTIVE')
            .select(sql<number>`count(*)::int`.as('n'))
            .as('flat_count'),
        )
        .where('rc.community_id', '=', communityId)
        .orderBy('rc.sort')
        .orderBy(sql`lower(rc.label)`)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        communityId: r.community_id,
        code: r.code,
        label: r.label,
        sort: r.sort,
        status: r.status,
        flatCount: r.flat_count ?? 0,
        version: r.version,
      }));
    });
  }

  async createCategory(actor: AdminActor, requestId: string, communityId: string, input: CreateResidenceCategoryInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const row = await trx
        .insertInto('app.residence_categories')
        .values({ community_id: communityId, code: input.code, label: input.label, sort: input.sort ?? 0 })
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      await auditAdmin(trx, actor, requestId, { action: 'residence_category.created', targetType: 'residence_category', targetId: row.id, after: row });
      return row.id;
    });
  }

  async updateCategory(actor: AdminActor, requestId: string, communityId: string, id: string, input: UpdateResidenceCategoryInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const before = await trx
        .selectFrom('app.residence_categories')
        .selectAll()
        .where('id', '=', id)
        .where('community_id', '=', communityId)
        .executeTakeFirst();
      if (!before) throw notFound('Residence category');
      const updated = await trx
        .updateTable('app.residence_categories')
        .set({
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.sort !== undefined ? { sort: input.sort } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returningAll()
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      await auditAdmin(trx, actor, requestId, { action: 'residence_category.updated', targetType: 'residence_category', targetId: id, before, after: updated });
    });
  }

  // ----------------------------------------------------------- time windows

  async listWindows(actor: AdminActor, communityId: string): Promise<TimeWindow[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const rows = await trx
        .selectFrom('app.time_windows')
        .selectAll()
        .where('community_id', '=', communityId)
        .orderBy('start_time')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        communityId: r.community_id,
        name: r.name,
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        status: r.status,
        version: r.version,
      }));
    });
  }

  async createWindow(actor: AdminActor, requestId: string, communityId: string, input: CreateTimeWindowInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const row = await trx
        .insertInto('app.time_windows')
        .values({ community_id: communityId, name: input.name, start_time: input.startTime, end_time: input.endTime })
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      await auditAdmin(trx, actor, requestId, { action: 'time_window.created', targetType: 'time_window', targetId: row.id, after: row });
    });
  }

  async updateWindow(actor: AdminActor, requestId: string, communityId: string, id: string, input: UpdateTimeWindowInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const before = await trx
        .selectFrom('app.time_windows')
        .selectAll()
        .where('id', '=', id)
        .where('community_id', '=', communityId)
        .executeTakeFirst();
      if (!before) throw notFound('Time window');
      const start = input.startTime ?? hhmm(before.start_time);
      const end = input.endTime ?? hhmm(before.end_time);
      if (end <= start) throw businessRule('End time must be after start time');
      const updated = await trx
        .updateTable('app.time_windows')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          start_time: start,
          end_time: end,
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returningAll()
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      await auditAdmin(trx, actor, requestId, { action: 'time_window.updated', targetType: 'time_window', targetId: id, before, after: updated });
    });
  }

  // ------------------------------------------------------------------ tasks

  async listTasks(actor: AdminActor, communityId: string): Promise<ServiceTask[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const rows = await trx
        .selectFrom('app.service_tasks as t')
        .innerJoin('app.services as s', 's.id', 't.service_id')
        .selectAll('t')
        .select('s.code as service_code')
        .where('t.community_id', '=', communityId)
        .orderBy('s.sort')
        .orderBy(sql`lower(t.name)`)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        communityId: r.community_id,
        serviceId: r.service_id,
        serviceCode: r.service_code,
        name: r.name,
        description: r.description,
        defaultDurationMin: r.default_duration_min,
        status: r.status,
        version: r.version,
      }));
    });
  }

  async createTask(actor: AdminActor, requestId: string, communityId: string, input: CreateServiceTaskInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const row = await trx
        .insertInto('app.service_tasks')
        .values({
          community_id: communityId,
          service_id: input.serviceId,
          name: input.name,
          description: input.description ?? null,
          default_duration_min: input.defaultDurationMin ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      await auditAdmin(trx, actor, requestId, { action: 'service_task.created', targetType: 'service_task', targetId: row.id, after: row });
    });
  }

  async updateTask(actor: AdminActor, requestId: string, communityId: string, id: string, input: UpdateServiceTaskInput) {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const before = await trx
        .selectFrom('app.service_tasks')
        .selectAll()
        .where('id', '=', id)
        .where('community_id', '=', communityId)
        .executeTakeFirst();
      if (!before) throw notFound('Task');
      const updated = await trx
        .updateTable('app.service_tasks')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.defaultDurationMin !== undefined ? { default_duration_min: input.defaultDurationMin } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returningAll()
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      await auditAdmin(trx, actor, requestId, { action: 'service_task.updated', targetType: 'service_task', targetId: id, before, after: updated });
    });
  }

  // ----------------------------------------------------- catalogue versions

  async listVersions(actor: AdminActor, communityId: string): Promise<CatalogueVersionSummary[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const rows = await this.versionQuery(trx).where('v.community_id', '=', communityId).orderBy('v.version_no', 'desc').execute();
      return rows.map(toSummary);
    });
  }

  private versionQuery(trx: Tx) {
    return trx
      .selectFrom('app.catalogue_versions as v')
      .selectAll('v')
      .select((eb) =>
        eb
          .selectFrom('app.plans as p')
          .whereRef('p.catalogue_version_id', '=', 'v.id')
          .select(sql<number>`count(*)::int`.as('n'))
          .as('plan_count'),
      );
  }

  /** Loads a version the admin may see (via its community). */
  private async scopedVersion(trx: Tx, actor: AdminActor, versionId: string, opts: { draft?: boolean; lock?: boolean } = {}) {
    let q = trx.selectFrom('app.catalogue_versions').selectAll().where('id', '=', versionId);
    if (opts.lock) q = q.forUpdate();
    const v = await q.executeTakeFirst();
    if (!v) throw notFound('Catalogue version');
    try {
      await visibleCommunity(trx, actor, v.community_id);
    } catch {
      throw notFound('Catalogue version');
    }
    if (opts.draft && v.status !== 'DRAFT') throw businessRule('Only draft versions can be changed. Create a new draft first.');
    return v;
  }

  async getVersion(actor: AdminActor, versionId: string): Promise<CatalogueVersionDetail> {
    return this.tx(actor, async (trx) => {
      await this.scopedVersion(trx, actor, versionId);
      return this.loadDetail(trx, versionId);
    });
  }

  private async loadDetail(trx: Tx, versionId: string): Promise<CatalogueVersionDetail> {
    const summary = toSummary(await this.versionQuery(trx).where('v.id', '=', versionId).executeTakeFirstOrThrow());
    const plans = await trx
      .selectFrom('app.plans')
      .selectAll()
      .where('catalogue_version_id', '=', versionId)
      .orderBy('sort')
      .orderBy(sql`lower(name)`)
      .execute();
    const planIds = plans.map((p) => p.id);
    const components = planIds.length
      ? await trx
          .selectFrom('app.plan_components as c')
          .innerJoin('app.services as s', 's.id', 'c.service_id')
          .selectAll('c')
          .select('s.code as service_code')
          .where('c.plan_id', 'in', planIds)
          .orderBy('c.sort')
          .orderBy('s.sort')
          .execute()
      : [];
    const componentIds = components.map((c) => c.id);
    const tasks = componentIds.length
      ? await trx.selectFrom('app.plan_component_tasks').selectAll().where('plan_component_id', 'in', componentIds).execute()
      : [];
    const prices = await trx.selectFrom('app.plan_prices').selectAll().where('catalogue_version_id', '=', versionId).execute();
    const addonPrices = componentIds.length
      ? await trx.selectFrom('app.plan_component_prices').selectAll().where('plan_component_id', 'in', componentIds).execute()
      : [];

    const toComponent = (c: (typeof components)[number]): PlanComponent => ({
      id: c.id,
      planId: c.plan_id,
      serviceId: c.service_id,
      serviceCode: c.service_code,
      isOptionalAddon: c.is_optional_addon,
      visitsPerDay: c.visits_per_day,
      daysOfWeek: c.days_of_week,
      durationMinutes: c.duration_minutes,
      timeWindowId: c.time_window_id,
      addonHours: c.addon_hours === null ? null : Number(c.addon_hours),
      tasks: tasks
        .filter((t) => t.plan_component_id === c.id)
        .map((t) => ({ serviceTaskId: t.service_task_id, frequency: t.frequency, timesPerPeriod: t.times_per_period })),
    });

    return {
      ...summary,
      plans: plans.map(
        (p): Plan => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          validityDays: p.validity_days,
          sort: p.sort,
          components: components.filter((c) => c.plan_id === p.id).map(toComponent),
        }),
      ),
      prices: prices.map((r) => ({
        planId: r.plan_id,
        residenceCategoryId: r.residence_category_id,
        priceBasis: r.price_basis,
        serviceId: r.service_id,
        amountPaise: Number(r.amount_paise),
      })),
      addonPrices: addonPrices.map((r) => ({
        planComponentId: r.plan_component_id,
        residenceCategoryId: r.residence_category_id,
        amountPaise: Number(r.amount_paise),
      })),
    };
  }

  /** New DRAFT, optionally copying the currently published version (plans, components, tasks, prices). */
  async createDraft(actor: AdminActor, requestId: string, communityId: string, input: CreateDraftInput): Promise<CatalogueVersionDetail> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId, { lock: true });
      const existingDraft = await trx
        .selectFrom('app.catalogue_versions')
        .select('id')
        .where('community_id', '=', communityId)
        .where('status', '=', 'DRAFT')
        .executeTakeFirst();
      if (existingDraft) throw businessRule('A draft already exists for this community. Continue editing it or discard it.');

      const last = await trx
        .selectFrom('app.catalogue_versions')
        .select(sql<number>`coalesce(max(version_no), 0)::int`.as('n'))
        .where('community_id', '=', communityId)
        .executeTakeFirstOrThrow();
      const draft = await trx
        .insertInto('app.catalogue_versions')
        .values({ community_id: communityId, version_no: last.n + 1, notes: input.notes ?? null })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);

      if (input.copyFromPublished) {
        const published = await trx
          .selectFrom('app.catalogue_versions')
          .select('id')
          .where('community_id', '=', communityId)
          .where('status', '=', 'PUBLISHED')
          .executeTakeFirst();
        if (published) await this.copyVersion(trx, published.id, draft.id);
      }

      await auditAdmin(trx, actor, requestId, {
        action: 'catalogue.draft_created',
        targetType: 'catalogue_version',
        targetId: draft.id,
        after: { versionNo: last.n + 1, copiedFromPublished: input.copyFromPublished },
      });
      return this.loadDetail(trx, draft.id);
    });
  }

  private async copyVersion(trx: Tx, fromId: string, toId: string) {
    const plans = await trx.selectFrom('app.plans').selectAll().where('catalogue_version_id', '=', fromId).execute();
    const planMap = new Map<string, string>();
    const componentMap = new Map<string, string>();
    for (const p of plans) {
      const np = await trx
        .insertInto('app.plans')
        .values({
          catalogue_version_id: toId,
          code: p.code,
          name: p.name,
          description: p.description,
          validity_days: p.validity_days,
          sort: p.sort,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      planMap.set(p.id, np.id);
      const comps = await trx.selectFrom('app.plan_components').selectAll().where('plan_id', '=', p.id).execute();
      for (const c of comps) {
        const nc = await trx
          .insertInto('app.plan_components')
          .values({
            plan_id: np.id,
            service_id: c.service_id,
            is_optional_addon: c.is_optional_addon,
            visits_per_day: c.visits_per_day,
            days_of_week: c.days_of_week,
            duration_minutes: c.duration_minutes,
            time_window_id: c.time_window_id,
            addon_hours: c.addon_hours,
            sort: c.sort,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        componentMap.set(c.id, nc.id);
        const tasks = await trx.selectFrom('app.plan_component_tasks').selectAll().where('plan_component_id', '=', c.id).execute();
        if (tasks.length) {
          await trx
            .insertInto('app.plan_component_tasks')
            .values(tasks.map((t) => ({ ...t, plan_component_id: nc.id })))
            .execute();
        }
      }
    }
    const prices = await trx.selectFrom('app.plan_prices').selectAll().where('catalogue_version_id', '=', fromId).execute();
    if (prices.length) {
      await trx
        .insertInto('app.plan_prices')
        .values(
          prices.map((r) => ({
            catalogue_version_id: toId,
            plan_id: planMap.get(r.plan_id)!,
            residence_category_id: r.residence_category_id,
            price_basis: r.price_basis,
            service_id: r.service_id,
            amount_paise: r.amount_paise,
          })),
        )
        .execute();
    }
    const fromComponents = [...componentMap.keys()];
    if (fromComponents.length) {
      const addon = await trx.selectFrom('app.plan_component_prices').selectAll().where('plan_component_id', 'in', fromComponents).execute();
      if (addon.length) {
        await trx
          .insertInto('app.plan_component_prices')
          .values(
            addon.map((r) => ({
              plan_component_id: componentMap.get(r.plan_component_id)!,
              residence_category_id: r.residence_category_id,
              amount_paise: r.amount_paise,
            })),
          )
          .execute();
      }
    }
  }

  async discardDraft(actor: AdminActor, requestId: string, versionId: string) {
    await this.tx(actor, async (trx) => {
      const v = await this.scopedVersion(trx, actor, versionId, { draft: true, lock: true });
      await trx.deleteFrom('app.catalogue_versions').where('id', '=', versionId).execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'catalogue.draft_discarded',
        targetType: 'catalogue_version',
        targetId: versionId,
        before: { versionNo: v.version_no },
      });
    });
  }

  // ------------------------------------------------------------------ plans

  async createPlan(actor: AdminActor, requestId: string, versionId: string, input: UpsertPlanInput) {
    return this.tx(actor, async (trx) => {
      await this.scopedVersion(trx, actor, versionId, { draft: true });
      const row = await trx
        .insertInto('app.plans')
        .values({
          catalogue_version_id: versionId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          validity_days: input.validityDays,
          sort: input.sort ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      await auditAdmin(trx, actor, requestId, { action: 'plan.created', targetType: 'plan', targetId: row.id, after: row });
      return this.loadDetail(trx, versionId);
    });
  }

  private async scopedPlan(trx: Tx, actor: AdminActor, planId: string) {
    const plan = await trx.selectFrom('app.plans').selectAll().where('id', '=', planId).executeTakeFirst();
    if (!plan) throw notFound('Plan');
    await this.scopedVersion(trx, actor, plan.catalogue_version_id, { draft: true });
    return plan;
  }

  async updatePlan(actor: AdminActor, requestId: string, planId: string, input: UpsertPlanInput) {
    return this.tx(actor, async (trx) => {
      const before = await this.scopedPlan(trx, actor, planId);
      const after = await trx
        .updateTable('app.plans')
        .set({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          validity_days: input.validityDays,
          sort: input.sort ?? before.sort,
        })
        .where('id', '=', planId)
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      await auditAdmin(trx, actor, requestId, { action: 'plan.updated', targetType: 'plan', targetId: planId, before, after });
      return this.loadDetail(trx, before.catalogue_version_id);
    });
  }

  async deletePlan(actor: AdminActor, requestId: string, planId: string) {
    return this.tx(actor, async (trx) => {
      const before = await this.scopedPlan(trx, actor, planId);
      await trx.deleteFrom('app.plans').where('id', '=', planId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'plan.deleted', targetType: 'plan', targetId: planId, before });
      return this.loadDetail(trx, before.catalogue_version_id);
    });
  }

  // ------------------------------------------------------------- components

  private async assertComponentRefs(trx: Tx, communityId: string, input: UpsertComponentInput) {
    if (input.timeWindowId) {
      const w = await trx
        .selectFrom('app.time_windows')
        .select(['status'])
        .where('id', '=', input.timeWindowId)
        .where('community_id', '=', communityId)
        .executeTakeFirst();
      if (!w) throw notFound('Time window');
      if (w.status !== 'ACTIVE') throw businessRule('This time window is inactive');
    }
    if (input.tasks.length) {
      const ids = input.tasks.map((t) => t.serviceTaskId);
      const found = await trx
        .selectFrom('app.service_tasks')
        .select(['id', 'service_id', 'status'])
        .where('id', 'in', ids)
        .where('community_id', '=', communityId)
        .execute();
      if (found.length !== ids.length) throw businessRule('One or more tasks do not exist in this community');
      if (found.some((t) => t.service_id !== input.serviceId)) throw businessRule('Tasks must belong to the component’s service');
      if (found.some((t) => t.status !== 'ACTIVE')) throw businessRule('One or more tasks are inactive');
    }
  }

  async createComponent(actor: AdminActor, requestId: string, planId: string, input: UpsertComponentInput) {
    return this.tx(actor, async (trx) => {
      const plan = await this.scopedPlan(trx, actor, planId);
      const version = await trx.selectFrom('app.catalogue_versions').select('community_id').where('id', '=', plan.catalogue_version_id).executeTakeFirstOrThrow();
      await this.assertComponentRefs(trx, version.community_id, input);
      const row = await trx
        .insertInto('app.plan_components')
        .values({
          plan_id: planId,
          service_id: input.serviceId,
          is_optional_addon: input.isOptionalAddon,
          visits_per_day: input.visitsPerDay,
          days_of_week: input.daysOfWeek,
          duration_minutes: input.durationMinutes,
          time_window_id: input.timeWindowId ?? null,
          addon_hours: input.addonHours ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      if (input.tasks.length) {
        await trx
          .insertInto('app.plan_component_tasks')
          .values(input.tasks.map((t) => ({ plan_component_id: row.id, service_task_id: t.serviceTaskId, frequency: t.frequency, times_per_period: t.timesPerPeriod })))
          .execute();
      }
      await auditAdmin(trx, actor, requestId, { action: 'plan_component.created', targetType: 'plan_component', targetId: row.id, after: input });
      return this.loadDetail(trx, plan.catalogue_version_id);
    });
  }

  private async scopedComponent(trx: Tx, actor: AdminActor, componentId: string) {
    const c = await trx.selectFrom('app.plan_components').selectAll().where('id', '=', componentId).executeTakeFirst();
    if (!c) throw notFound('Plan component');
    const plan = await this.scopedPlan(trx, actor, c.plan_id);
    return { component: c, plan };
  }

  async updateComponent(actor: AdminActor, requestId: string, componentId: string, input: UpsertComponentInput) {
    return this.tx(actor, async (trx) => {
      const { component, plan } = await this.scopedComponent(trx, actor, componentId);
      const version = await trx.selectFrom('app.catalogue_versions').select('community_id').where('id', '=', plan.catalogue_version_id).executeTakeFirstOrThrow();
      await this.assertComponentRefs(trx, version.community_id, input);
      if (input.serviceId !== component.service_id) {
        // Changing the service invalidates service-basis prices for the old one.
        await trx
          .deleteFrom('app.plan_prices')
          .where('plan_id', '=', plan.id)
          .where('service_id', '=', component.service_id)
          .execute();
      }
      await trx
        .updateTable('app.plan_components')
        .set({
          service_id: input.serviceId,
          is_optional_addon: input.isOptionalAddon,
          visits_per_day: input.visitsPerDay,
          days_of_week: input.daysOfWeek,
          duration_minutes: input.durationMinutes,
          time_window_id: input.timeWindowId ?? null,
          addon_hours: input.addonHours ?? null,
        })
        .where('id', '=', componentId)
        .execute()
        .catch(mapPg);
      if (!input.isOptionalAddon) {
        await trx.deleteFrom('app.plan_component_prices').where('plan_component_id', '=', componentId).execute();
      }
      await trx.deleteFrom('app.plan_component_tasks').where('plan_component_id', '=', componentId).execute();
      if (input.tasks.length) {
        await trx
          .insertInto('app.plan_component_tasks')
          .values(input.tasks.map((t) => ({ plan_component_id: componentId, service_task_id: t.serviceTaskId, frequency: t.frequency, times_per_period: t.timesPerPeriod })))
          .execute();
      }
      await auditAdmin(trx, actor, requestId, { action: 'plan_component.updated', targetType: 'plan_component', targetId: componentId, before: component, after: input });
      return this.loadDetail(trx, plan.catalogue_version_id);
    });
  }

  async deleteComponent(actor: AdminActor, requestId: string, componentId: string) {
    return this.tx(actor, async (trx) => {
      const { component, plan } = await this.scopedComponent(trx, actor, componentId);
      await trx
        .deleteFrom('app.plan_prices')
        .where('plan_id', '=', plan.id)
        .where('service_id', '=', component.service_id)
        .execute();
      await trx.deleteFrom('app.plan_components').where('id', '=', componentId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'plan_component.deleted', targetType: 'plan_component', targetId: componentId, before: component });
      return this.loadDetail(trx, plan.catalogue_version_id);
    });
  }

  // ----------------------------------------------------------- price matrix

  /** Replaces the whole matrix of a draft in one transaction. Empty cell = not offered. */
  async putPriceMatrix(actor: AdminActor, requestId: string, versionId: string, input: PutPriceMatrixInput) {
    return this.tx(actor, async (trx) => {
      const v = await this.scopedVersion(trx, actor, versionId, { draft: true, lock: true });
      const detail = await this.loadDetail(trx, versionId);
      const plans = new Map(detail.plans.map((p) => [p.id, p]));
      const addonComponents = new Map(detail.plans.flatMap((p) => p.components.filter((c) => c.isOptionalAddon).map((c) => [c.id, c])));
      const categories = new Set(
        (
          await trx
            .selectFrom('app.residence_categories')
            .select('id')
            .where('community_id', '=', v.community_id)
            .where('status', '=', 'ACTIVE')
            .execute()
        ).map((c) => c.id),
      );

      const seen = new Set<string>();
      for (const cell of input.cells) {
        const plan = plans.get(cell.planId);
        if (!plan) throw businessRule('A price refers to a plan that is not in this version');
        if (!categories.has(cell.residenceCategoryId)) throw businessRule('A price refers to an unknown or inactive residence category');
        if (cell.priceBasis === 'SERVICE' && !plan.components.some((c) => !c.isOptionalAddon && c.serviceId === cell.serviceId)) {
          throw businessRule(`A service price in plan ${plan.name} refers to a service that is not part of it`);
        }
        const key = `${cell.planId}|${cell.residenceCategoryId}|${cell.priceBasis}|${cell.serviceId ?? ''}`;
        if (seen.has(key)) throw businessRule('The same price cell appears twice');
        seen.add(key);
      }
      for (const cell of input.addonCells) {
        if (!addonComponents.has(cell.planComponentId)) throw businessRule('An add-on price refers to a component that is not an add-on in this version');
        if (!categories.has(cell.residenceCategoryId)) throw businessRule('An add-on price refers to an unknown or inactive residence category');
      }

      await trx.deleteFrom('app.plan_prices').where('catalogue_version_id', '=', versionId).execute();
      if (addonComponents.size) {
        await trx.deleteFrom('app.plan_component_prices').where('plan_component_id', 'in', [...addonComponents.keys()]).execute();
      }
      if (input.cells.length) {
        await trx
          .insertInto('app.plan_prices')
          .values(
            input.cells.map((c) => ({
              catalogue_version_id: versionId,
              plan_id: c.planId,
              residence_category_id: c.residenceCategoryId,
              price_basis: c.priceBasis,
              service_id: c.serviceId,
              amount_paise: c.amountPaise,
            })),
          )
          .execute();
      }
      if (input.addonCells.length) {
        await trx
          .insertInto('app.plan_component_prices')
          .values(input.addonCells.map((c) => ({ plan_component_id: c.planComponentId, residence_category_id: c.residenceCategoryId, amount_paise: c.amountPaise })))
          .execute();
      }
      await auditAdmin(trx, actor, requestId, {
        action: 'catalogue.prices_replaced',
        targetType: 'catalogue_version',
        targetId: versionId,
        before: { cells: detail.prices.length, addonCells: detail.addonPrices.length },
        after: { cells: input.cells.length, addonCells: input.addonCells.length },
      });
      return this.loadDetail(trx, versionId);
    });
  }

  // ------------------------------------------------------ validate & publish

  async validate(actor: AdminActor, versionId: string): Promise<CatalogueValidation> {
    return this.tx(actor, async (trx) => {
      const v = await this.scopedVersion(trx, actor, versionId);
      return this.runValidation(trx, v.community_id, versionId);
    });
  }

  private async runValidation(trx: Tx, communityId: string, versionId: string): Promise<CatalogueValidation> {
    const detail = await this.loadDetail(trx, versionId);
    const community = await trx.selectFrom('app.communities').select('default_operating_mode').where('id', '=', communityId).executeTakeFirstOrThrow();
    const services = await this.loadServices(trx, communityId, community.default_operating_mode);
    const enabled = new Map(services.services.filter((s) => s.enabled).map((s) => [s.serviceId, s]));
    const windows = new Map(
      (await trx.selectFrom('app.time_windows').select(['id', 'status']).where('community_id', '=', communityId).execute()).map((w) => [w.id, w.status]),
    );
    const categories = await trx
      .selectFrom('app.residence_categories')
      .select(['id', 'label'])
      .where('community_id', '=', communityId)
      .where('status', '=', 'ACTIVE')
      .execute();

    const issues: CatalogueIssue[] = [];
    const err = (code: string, message: string, planId?: string) => issues.push({ severity: 'ERROR', code, message, ...(planId ? { planId } : {}) });
    const warn = (code: string, message: string, planId?: string) => issues.push({ severity: 'WARNING', code, message, ...(planId ? { planId } : {}) });

    if (enabled.size === 0) err('NO_SERVICES', 'No service is enabled for this community');
    if (categories.length === 0) err('NO_CATEGORIES', 'No active residence categories are defined');
    if (detail.plans.length === 0) err('NO_PLANS', 'Add at least one plan');

    for (const p of detail.plans) {
      const core = p.components.filter((c) => !c.isOptionalAddon);
      if (core.length === 0) err('PLAN_NO_SERVICE', `${p.name}: add at least one service (not only add-ons)`, p.id);
      for (const c of p.components) {
        const s = enabled.get(c.serviceId);
        if (!s) err('SERVICE_DISABLED', `${p.name}: ${c.serviceCode} is not enabled for this community`, p.id);
        if (c.tasks.length === 0) err('COMPONENT_NO_TASKS', `${p.name}: ${c.serviceCode} has no tasks`, p.id);
        if (c.timeWindowId && windows.get(c.timeWindowId) !== 'ACTIVE') err('WINDOW_INACTIVE', `${p.name}: ${c.serviceCode} uses an inactive time window`, p.id);
        if (!c.timeWindowId) warn('NO_WINDOW', `${p.name}: ${c.serviceCode} has no time window`, p.id);
        if (c.isOptionalAddon && !detail.addonPrices.some((a) => a.planComponentId === c.id)) {
          warn('ADDON_NOT_OFFERED', `${p.name}: add-on ${c.serviceCode} has no price for any category, so it will not be offered`, p.id);
        }
      }
      if (!detail.prices.some((x) => x.planId === p.id)) err('PLAN_NO_PRICE', `${p.name}: no price for any residence category, so it cannot be sold`, p.id);
    }
    for (const c of categories) {
      if (detail.plans.length && !detail.prices.some((x) => x.residenceCategoryId === c.id)) {
        warn('CATEGORY_NOT_OFFERED', `No plan is offered to "${c.label}" flats`);
      }
    }
    for (const s of enabled.values()) {
      if (!detail.plans.some((p) => p.components.some((c) => c.serviceId === s.serviceId))) {
        warn('SERVICE_UNUSED', `${s.name} is enabled but no plan includes it`);
      }
    }
    return { publishable: !issues.some((i) => i.severity === 'ERROR'), issues };
  }

  async publish(actor: AdminActor, requestId: string, versionId: string, input: PublishCatalogueInput): Promise<CatalogueVersionDetail> {
    return this.tx(actor, async (trx) => {
      const v = await this.scopedVersion(trx, actor, versionId, { draft: true, lock: true });
      await visibleCommunity(trx, actor, v.community_id, { lock: true });
      const validation = await this.runValidation(trx, v.community_id, versionId);
      if (!validation.publishable) {
        throw businessRule(`This version has ${validation.issues.filter((i) => i.severity === 'ERROR').length} problem(s) to fix before publishing`);
      }
      const previous = await trx
        .updateTable('app.catalogue_versions')
        .set({ status: 'SUPERSEDED' })
        .where('community_id', '=', v.community_id)
        .where('status', '=', 'PUBLISHED')
        .returning('id')
        .executeTakeFirst();
      await trx
        .updateTable('app.catalogue_versions')
        .set({
          status: 'PUBLISHED',
          published_at: sql`now()`,
          published_by: actor.id,
          effective_from: input.effectiveFrom ?? sql`(now() at time zone 'Asia/Kolkata')::date`,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where('id', '=', versionId)
        .execute();
      // Onboarding progress: an imported community becomes CONFIGURED once it has a published catalogue.
      await trx.updateTable('app.communities').set({ status: 'CONFIGURED' }).where('id', '=', v.community_id).where('status', '=', 'IMPORTED').execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'catalogue.published',
        targetType: 'catalogue_version',
        targetId: versionId,
        after: { versionNo: v.version_no, supersededVersionId: previous?.id ?? null, warnings: validation.issues.length },
      });
      return this.loadDetail(trx, versionId);
    });
  }
}

function toSummary(r: {
  id: string;
  community_id: string;
  version_no: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  effective_from: string | null;
  notes: string | null;
  published_at: Date | string | null;
  plan_count: number | null;
  version: number;
}): CatalogueVersionSummary {
  return {
    id: r.id,
    communityId: r.community_id,
    versionNo: r.version_no,
    status: r.status,
    effectiveFrom: r.effective_from,
    notes: r.notes,
    publishedAt: iso(r.published_at),
    planCount: r.plan_count ?? 0,
    version: r.version,
  };
}
