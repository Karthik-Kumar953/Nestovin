'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActivationChecklist, CatalogueVersionSummary, Community } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { Link, useParams, useSearchParams } from '../../lib/router';
import { ErrorBanner, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { ServicesStep, CategoriesStep, TasksStep } from './BasicsSteps';
import { ImportStep } from './ImportStep';
import { PlansStep } from './PlansStep';
import { PricesStep } from './PricesStep';
import { PublishStep, ActivateStep } from './PublishSteps';

/*
 * Community Setup wizard (ADM-04 + ADM-07, ADR-009/011).
 * Order matters: categories come before the import because the workbook's
 * "Residence category" column must match them.
 */
const STEPS = [
  { key: 'services', label: 'Services & time windows' },
  { key: 'categories', label: 'Residence categories' },
  { key: 'import', label: 'Import flats (Excel)' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'plans', label: 'Plans & packages' },
  { key: 'prices', label: 'Price matrix' },
  { key: 'publish', label: 'Review & publish' },
  { key: 'activate', label: 'Activate' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

export function useCommunity(communityId: string) {
  return useQuery({ queryKey: ['communities', communityId], queryFn: () => api<Community>(`/v1/admin/communities/${communityId}`) });
}

export function useVersions(communityId: string) {
  return useQuery({
    queryKey: ['catalogue-versions', communityId],
    queryFn: () => api<{ items: CatalogueVersionSummary[] }>(`/v1/admin/communities/${communityId}/catalogue-versions`),
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
  const community = useCommunity(id);
  const checklist = useQuery({
    queryKey: ['activation', id],
    queryFn: () => api<ActivationChecklist>(`/v1/admin/communities/${id}/activation`),
  });

  if (community.isLoading) return <Spinner />;
  if (community.error || !community.data) return <ErrorBanner error={community.error ?? new Error('Community not found')} />;
  const c = community.data;
  const done = (key: string) => checklist.data?.checks.find((x) => x.key === key)?.ok ?? false;
  const stepDone: Partial<Record<StepKey, boolean>> = {
    services: done('services'),
    categories: done('categories'),
    import: done('flats'),
    publish: done('catalogue'),
    activate: c.status === 'ACTIVE',
  };

  const go = (key: StepKey) => {
    const next = new URLSearchParams(params);
    next.set('step', key);
    setParams(next, { replace: false });
  };

  return (
    <>
      <p className="breadcrumb">
        <Link to="/locations/communities">Communities</Link> / <Link to={`/locations/communities/${c.id}`}>{c.name}</Link> / Setup
      </p>
      <PageHeader
        title={`Community setup: ${c.name}`}
        description="Configure what this community offers and at what price. Every community is set up independently; nothing is copied from a global price list."
        actions={<StatusBadge status={c.status} />}
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
                  <span className={`setup-step-num ${stepDone[s.key] ? 'done' : ''}`}>{stepDone[s.key] ? '✓' : i + 1}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <section className="setup-body">
          {step === 'services' ? <ServicesStep communityId={c.id} /> : null}
          {step === 'categories' ? <CategoriesStep communityId={c.id} /> : null}
          {step === 'import' ? <ImportStep communityId={c.id} /> : null}
          {step === 'tasks' ? <TasksStep communityId={c.id} /> : null}
          {step === 'plans' ? <PlansStep communityId={c.id} /> : null}
          {step === 'prices' ? <PricesStep communityId={c.id} /> : null}
          {step === 'publish' ? <PublishStep communityId={c.id} /> : null}
          {step === 'activate' ? <ActivateStep communityId={c.id} community={c} /> : null}
          <div className="setup-nav">
            {STEPS.findIndex((s) => s.key === step) > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => go(STEPS[STEPS.findIndex((s) => s.key === step) - 1]!.key)}>
                ← Previous step
              </button>
            ) : (
              <span />
            )}
            {STEPS.findIndex((s) => s.key === step) < STEPS.length - 1 ? (
              <button type="button" className="btn btn-secondary" onClick={() => go(STEPS[STEPS.findIndex((s) => s.key === step) + 1]!.key)}>
                Next step →
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
