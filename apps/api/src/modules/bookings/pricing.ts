import type { SelectionInput } from '@nestovin/contracts';
import type { Tx } from '../../db/database';
import { businessRule, notFound } from '../../lib/errors';

/**
 * Initial commitment split (ADR-015): whole percentage, rounded half up in paise.
 * remaining = total - initial, so the two always add up to the total.
 */
export function splitInitial(totalPaise: number, pct: number | null): { initial: number; remaining: number } {
  if (pct === null) return { initial: totalPaise, remaining: 0 };
  if (!Number.isInteger(pct) || pct < 1 || pct > 99) throw new Error('initial percentage must be a whole number 1-99');
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) throw new Error('total must be positive paise');
  // Integer arithmetic: floor((total * pct * 2 + 100) / 200) == round_half_up(total * pct / 100)
  const initial = Math.floor((totalPaise * pct * 2 + 100) / 200);
  return { initial, remaining: totalPaise - initial };
}

/** Add a number of days to a YYYY-MM-DD date (UTC calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PricedComponent {
  componentId: string;
  serviceId: string;
  serviceName: string;
  isAddon: boolean;
  visitsPerDay: number;
  daysOfWeek: number;
  durationMinutes: number;
  timeWindow: { name: string; startTime: string; endTime: string } | null;
  addonHours: number | null;
  addonPricePaise: number | null;
  tasks: { name: string; frequency: string; timesPerPeriod: number }[];
}

export interface PricedSelection {
  versionId: string;
  planId: string;
  planCode: string;
  planName: string;
  serviceId: string | null;
  selectionLabel: string;
  validityDays: number;
  categoryId: string;
  categoryLabel: string;
  totalPaise: number;
  /** Services the selection needs (for the operating-mode check). */
  serviceIds: string[];
  components: PricedComponent[];
}

/**
 * Prices a selection against a catalogue version for a flat's residence category.
 * A missing price cell means "not offered" (ADR-009). Never trusts client amounts.
 */
export async function priceSelection(
  trx: Tx,
  args: { versionId: string; categoryId: string; selection: SelectionInput },
): Promise<PricedSelection> {
  const { versionId, categoryId, selection } = args;
  const plan = await trx
    .selectFrom('app.plans')
    .select(['id', 'code', 'name', 'validity_days', 'catalogue_version_id'])
    .where('id', '=', selection.planId)
    .executeTakeFirst();
  if (!plan || plan.catalogue_version_id !== versionId) throw notFound('Plan');
  const category = await trx.selectFrom('app.residence_categories').select(['id', 'label']).where('id', '=', categoryId).executeTakeFirst();
  if (!category) throw businessRule('Your flat does not have a pricing category yet. Contact Nestovin support.');

  const prices = await trx
    .selectFrom('app.plan_prices')
    .select(['price_basis', 'service_id', 'amount_paise'])
    .where('plan_id', '=', plan.id)
    .where('residence_category_id', '=', categoryId)
    .execute();
  const base = selection.serviceId
    ? prices.find((p) => p.price_basis === 'SERVICE' && p.service_id === selection.serviceId)
    : prices.find((p) => p.price_basis === 'PACKAGE');
  if (!base) throw businessRule('This plan option is not offered for your flat');

  const comps = await trx
    .selectFrom('app.plan_components as c')
    .innerJoin('app.services as s', 's.id', 'c.service_id')
    .leftJoin('app.time_windows as w', 'w.id', 'c.time_window_id')
    .select([
      'c.id', 'c.service_id', 's.name as service_name', 'c.is_optional_addon', 'c.visits_per_day', 'c.days_of_week',
      'c.duration_minutes', 'c.addon_hours', 'w.name as window_name', 'w.start_time', 'w.end_time',
    ])
    .where('c.plan_id', '=', plan.id)
    .orderBy('c.sort')
    .execute();
  const included = comps.filter((c) => !c.is_optional_addon && (!selection.serviceId || c.service_id === selection.serviceId));
  if (included.length === 0) throw businessRule('This plan option has no services configured');

  const wantedAddons = [...new Set(selection.addonComponentIds)];
  const addonRows = comps.filter((c) => c.is_optional_addon && wantedAddons.includes(c.id));
  if (addonRows.length !== wantedAddons.length) throw businessRule('One of the selected add-ons is not part of this plan');
  const addonPrices = addonRows.length
    ? await trx
        .selectFrom('app.plan_component_prices')
        .select(['plan_component_id', 'amount_paise'])
        .where('plan_component_id', 'in', addonRows.map((a) => a.id))
        .where('residence_category_id', '=', categoryId)
        .execute()
    : [];
  if (addonPrices.length !== addonRows.length) throw businessRule('One of the selected add-ons is not offered for your flat');

  const chosen = [...included, ...addonRows];
  const tasks = await trx
    .selectFrom('app.plan_component_tasks as pt')
    .innerJoin('app.service_tasks as t', 't.id', 'pt.service_task_id')
    .select(['pt.plan_component_id', 't.name', 'pt.frequency', 'pt.times_per_period'])
    .where('pt.plan_component_id', 'in', chosen.map((c) => c.id))
    .execute();

  const addonTotal = addonPrices.reduce((sum, a) => sum + Number(a.amount_paise), 0);
  const components: PricedComponent[] = chosen.map((c) => {
    const ap = addonPrices.find((a) => a.plan_component_id === c.id);
    return {
      componentId: c.id,
      serviceId: c.service_id,
      serviceName: c.service_name,
      isAddon: c.is_optional_addon,
      visitsPerDay: c.visits_per_day,
      daysOfWeek: c.days_of_week,
      durationMinutes: c.duration_minutes,
      timeWindow: c.window_name ? { name: c.window_name, startTime: String(c.start_time).slice(0, 5), endTime: String(c.end_time).slice(0, 5) } : null,
      addonHours: c.addon_hours === null ? null : Number(c.addon_hours),
      addonPricePaise: ap ? Number(ap.amount_paise) : null,
      tasks: tasks.filter((t) => t.plan_component_id === c.id).map((t) => ({ name: t.name, frequency: t.frequency, timesPerPeriod: t.times_per_period })),
    };
  });
  const serviceLabel = selection.serviceId ? (included[0]?.service_name ?? 'Service') : 'Complete package';
  const addonLabel = addonRows.map((a) => `${a.service_name} add-on`).join(', ');

  return {
    versionId,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    serviceId: selection.serviceId,
    selectionLabel: addonLabel ? `${serviceLabel} + ${addonLabel}` : serviceLabel,
    validityDays: plan.validity_days,
    categoryId: category.id,
    categoryLabel: category.label,
    totalPaise: Number(base.amount_paise) + addonTotal,
    serviceIds: [...new Set(chosen.map((c) => c.service_id))],
    components,
  };
}

/** Effective operating mode per service for a community (null = service not enabled). */
export async function serviceModes(trx: Tx, communityId: string): Promise<Map<string, 'DEMAND_LED' | 'CONTINUOUS' | null>> {
  const community = await trx.selectFrom('app.communities').select('default_operating_mode').where('id', '=', communityId).executeTakeFirstOrThrow();
  const rows = await trx
    .selectFrom('app.community_services')
    .select(['service_id', 'enabled', 'operating_mode'])
    .where('community_id', '=', communityId)
    .execute();
  return new Map(rows.map((r) => [r.service_id, r.enabled ? (r.operating_mode ?? community.default_operating_mode) : null]));
}

/** Every service in the selection must be enabled and use the given mode (ADR-015). */
export async function assertMode(trx: Tx, communityId: string, serviceIds: string[], mode: 'DEMAND_LED' | 'CONTINUOUS') {
  const modes = await serviceModes(trx, communityId);
  for (const id of serviceIds) {
    const m = modes.get(id);
    if (!m) throw businessRule('A service in this plan is not available in your community');
    if (m !== mode) {
      throw businessRule(
        mode === 'DEMAND_LED'
          ? 'This plan option is booked directly from available slots, not through a demand cycle'
          : 'This plan option is only available through a demand cycle',
      );
    }
  }
}

/** Snapshot JSON stored with the booking terms (immutable). */
export function planSnapshot(p: PricedSelection) {
  return {
    planCode: p.planCode,
    planName: p.planName,
    selectionLabel: p.selectionLabel,
    validityDays: p.validityDays,
    residenceCategory: p.categoryLabel,
    components: p.components,
  };
}
