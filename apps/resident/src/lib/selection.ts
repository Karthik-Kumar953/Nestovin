import type { BookingOptions, ResidentCatalogue } from '@nestovin/contracts';

export type Plan = ResidentCatalogue['plans'][number];
export type Component = Plan['components'][number];
export type PlanMode = 'DEMAND_LED' | 'CONTINUOUS' | 'MIXED' | null;

/** 'PACKAGE' = the complete package (serviceId null in the API). */
export type ServiceChoice = string | 'PACKAGE';

const modeOf = (modes: (string | null | undefined)[]): PlanMode => {
  const set = [...new Set(modes.filter(Boolean))];
  return set.length === 1 ? (set[0] as PlanMode) : set.length > 1 ? 'MIXED' : null;
};

/** The booking mode of a whole plan (from its base services). */
export function planMode(cat: ResidentCatalogue, plan: Plan): PlanMode {
  const modes = new Map(cat.services.map((s) => [s.serviceId, s.operatingMode]));
  return modeOf(
    plan.components.filter((c) => !c.isOptionalAddon).map((c) => modes.get(c.serviceId)),
  );
}

export const lowestPrice = (plan: Plan) => {
  const prices = [plan.packagePricePaise, ...plan.servicePrices.map((s) => s.pricePaise)].filter(
    (p): p is number => p !== null,
  );
  return prices.length ? Math.min(...prices) : null;
};

/** Everything a screen needs about one selection: services, mode, components and the tax-inclusive total. */
export function resolveSelection(
  cat: ResidentCatalogue | undefined,
  planId: string | undefined,
  serviceId: ServiceChoice | null | undefined,
  addonIds: string[],
) {
  const plan = cat?.plans.find((p) => p.id === planId);
  if (!cat || !plan || !serviceId)
    return {
      plan,
      services: [] as string[],
      mode: null as PlanMode,
      base: [] as Component[],
      addons: [] as Component[],
      total: null as number | null,
      label: '',
    };
  const modes = new Map(cat.services.map((s) => [s.serviceId, s.operatingMode]));
  const base = plan.components.filter(
    (c) => !c.isOptionalAddon && (serviceId === 'PACKAGE' || c.serviceId === serviceId),
  );
  const addons = plan.components.filter((c) => c.isOptionalAddon && addonIds.includes(c.id));
  const services = [...new Set([...base, ...addons].map((c) => c.serviceId))];
  const mode = modeOf(services.map((s) => modes.get(s)));
  const basePrice =
    serviceId === 'PACKAGE'
      ? plan.packagePricePaise
      : (plan.servicePrices.find((p) => p.serviceId === serviceId)?.pricePaise ?? null);
  const total =
    basePrice === null
      ? null
      : basePrice + addons.reduce((s, c) => s + (c.addonPricePaise ?? 0), 0);
  const label =
    serviceId === 'PACKAGE'
      ? 'Complete package'
      : (plan.servicePrices.find((p) => p.serviceId === serviceId)?.name ?? '');
  return { plan, services, mode, base, addons, total, label };
}

/** Whether a plan can be booked right now (an open round for it, or a free continuous slot). */
export function planAvailability(cat: ResidentCatalogue, plan: Plan, opts: BookingOptions) {
  const mode = planMode(cat, plan);
  const cycle = opts.openCycles.find((c) => c.planIds.includes(plan.id));
  const serviceIds = new Set(plan.components.map((c) => c.serviceId));
  const slots = opts.continuousSlots.filter(
    (s) => s.available && (!s.serviceId || serviceIds.has(s.serviceId)),
  );
  const open =
    mode === 'DEMAND_LED'
      ? Boolean(cycle)
      : mode === 'CONTINUOUS'
        ? slots.length > 0
        : Boolean(cycle) || slots.length > 0;
  return { mode, cycle, slots, open };
}

/** Initial amount estimate shown before the server quotes it (rounded half up, as the API does). */
export const initialEstimate = (total: number, pct: number) =>
  Math.floor((total * pct * 2 + 100) / 200);

export const parseAddons = (s: string | undefined) => (s ? s.split(',').filter(Boolean) : []);

/** Human summary of one component: "2 visits a day · 90 min · Every day · Morning". */
export function componentSummary(c: Component, daysLabel: (m: number) => string) {
  return [
    `${c.visitsPerDay} visit${c.visitsPerDay > 1 ? 's' : ''} a day`,
    `${c.durationMinutes} min`,
    daysLabel(c.daysOfWeek),
    c.timeWindow ? c.timeWindow.name : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
