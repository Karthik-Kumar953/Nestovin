'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActivationChecklist, CatalogueVersionSummary, Community } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { useParams, useSearchParams } from '../../lib/router';
import { Button, ButtonLink, ErrorBanner, PageHeader, Skeleton, StatusBadge } from '../../components/ui';
import { ArrowLeft, ArrowRight, Check } from '../../components/icons';
import { ServicesStep, CategoriesStep, TasksStep, useTasks } from './BasicsSteps';
import { ImportStep } from './ImportStep';
import { PlansStep, useVersionDetail } from './PlansStep';
import { PricesStep } from './PricesStep';
import { PublishStep, ActivateStep } from './PublishSteps';

/*
 * Community Setup wizard (ADM-04 + ADM-07, ADR-009/011).
 * Order matters: categories come before the import because the workbook's
 * "Residence category" column must match them.
 */
export const STEPS = [
  { key: 'services', label: 'Services & time windows' },
  { key: 'categories', label: 'Residence categories' },
  { key: 'import', label: 'Towers & flats' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'plans', label: 'Plans & packages' },
  { key: 'prices', label: 'Price matrix' },
  { key: 'publish', label: 'Review & publish' },
  { key: 'activate', label: 'Activate' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

/** Where the admin came from, so the wizard can send them back. */
const ORIGINS: Record<string, { to: string; label: string }> = {
  migration: { to: '/locations/migration', label: 'Community migration' },
  catalogue: { to: '/locations/catalogue', label: 'Catalogue & pricing' },
};

export function useCommunity(communityId: string) {
  return useQuery({ queryKey: ['communities', communityId], queryFn: () => api<Community>(`/v1/admin/communities/${communityId}`) });
}

export function useVersions(communityId: string, enabled = true) {
  return useQuery({
    queryKey: ['catalogue-versions', communityId],
    queryFn: () => api<{ items: CatalogueVersionSummary[] }>(`/v1/admin/communities/${communityId}/catalogue-versions`),
    enabled,
    select: (d) => ({
      all: d.items,
      draft: d.items.find((v) => v.status === 'DRAFT') ?? null,
      published: d.items.find((v) => v.status === 'PUBLISHED') ?? null,
    }),
  });
}

export function SetupPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const step = (STEPS.find((s) => s.key === params.get('step'))?.key ?? 'services') as StepKey;
  const origin = ORIGINS[params.get('from') ?? ''];
  const community = useCommunity(id);
  const checklist = useQuery({
    queryKey: ['activation', id],
    queryFn: () => api<ActivationChecklist>(`/v1/admin/communities/${id}/activation`),
  });
  // Steps without their own activation check are derived from the loaded data.
  const tasks = useTasks(id);
  const versions = useVersions(id);
  const shown = versions.data?.draft ?? versions.data?.published ?? null;
  const detail = useVersionDetail(shown?.id);

  if (community.isLoading)
    return (
      <div className="stack" aria-busy>
        <Skeleton height={28} width="40%" />
        <Skeleton height={320} />
      </div>
    );
  if (community.error || !community.data) return <ErrorBanner error={community.error ?? new Error('Community not found')} />;
  const c = community.data;
  const done = (key: string) => checklist.data?.checks.find((x) => x.key === key)?.ok ?? false;
  const plans = detail.data?.plans ?? [];
  const plansDone = plans.length > 0 && plans.every((p) => p.components.some((x) => !x.isOptionalAddon));
  const pricesDone =
    plans.length > 0 && plans.every((p) => (detail.data?.prices ?? []).some((pr) => pr.planId === p.id && pr.amountPaise > 0));
  const stepDone: Record<StepKey, boolean> = {
    services: done('services'),
    categories: done('categories'),
    import: done('flats'),
    tasks: (tasks.data ?? []).some((t) => t.status === 'ACTIVE'),
    plans: plansDone,
    prices: pricesDone,
    publish: done('catalogue'),
    activate: c.status === 'ACTIVE',
  };
  const index = STEPS.findIndex((s) => s.key === step);
  const doneCount = STEPS.filter((s) => stepDone[s.key]).length;

  const go = (key: StepKey) => {
    const next = new URLSearchParams(params);
    next.set('step', key);
    setParams(next, { replace: false });
  };

  return (
    <>
      <PageHeader
        crumb={{ to: `/locations/communities/${c.id}`, label: c.name }}
        title="Community setup"
        description={`${c.name} · ${c.cityName}. Each community is set up on its own; nothing is copied from a global price list.`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {origin ? (
              <ButtonLink to={origin.to} variant="ghost" icon={ArrowLeft}>
                {origin.label}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <div className="setup">
        <nav className="setup-steps" aria-label="Setup steps">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  className={`setup-step ${step === s.key ? 'active' : ''}`}
                  aria-current={step === s.key ? 'step' : undefined}
                  onClick={() => go(s.key)}
                >
                  <span className={`setup-step-num ${stepDone[s.key] ? 'done' : ''}`} aria-hidden>
                    {stepDone[s.key] ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                  </span>
                  {s.label}
                  {stepDone[s.key] ? <span className="sr-only"> (done)</span> : null}
                </button>
              </li>
            ))}
          </ol>
          <p className="faint" style={{ margin: '8px 6px 0', fontSize: 12.5 }}>
            {doneCount} of {STEPS.length} steps done
          </p>
        </nav>
        <section className="setup-body">
          {step === 'services' ? <ServicesStep communityId={c.id} /> : null}
          {step === 'categories' ? <CategoriesStep communityId={c.id} /> : null}
          {step === 'import' ? <ImportStep communityId={c.id} communityName={c.name} /> : null}
          {step === 'tasks' ? <TasksStep communityId={c.id} /> : null}
          {step === 'plans' ? <PlansStep communityId={c.id} /> : null}
          {step === 'prices' ? <PricesStep communityId={c.id} /> : null}
          {step === 'publish' ? <PublishStep communityId={c.id} communityName={c.name} /> : null}
          {step === 'activate' ? <ActivateStep communityId={c.id} community={c} /> : null}
          <div className="setup-nav">
            {index > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go(STEPS[index - 1]!.key)}>
                {STEPS[index - 1]!.label}
              </Button>
            ) : (
              <span />
            )}
            {index < STEPS.length - 1 ? (
              <Button variant="secondary" onClick={() => go(STEPS[index + 1]!.key)}>
                Next: {STEPS[index + 1]!.label}
                <ArrowRight size={16} />
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
