'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DemandCycle } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { useNavigate } from '../../lib/router';
import {
  Button,
  DataTable,
  ErrorBanner,
  Facts,
  FilterSelect,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Spinner,
  TextInput,
  Toolbar,
  useToast,
} from '../../components/ui';
import { CalendarClock, HandCoins, Plus } from '../../components/icons';
import { CommunityPicker, fromLocalInput, Pill, toLocalInput, useSelectedCommunity } from './shared';

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  validityDays: number;
}

export function usePublishedPlans(communityId: string) {
  return useQuery({
    queryKey: ['published-plans', communityId],
    queryFn: () => api<{ items: PlanOption[] }>(`/v1/admin/communities/${communityId}/published-plans`),
    enabled: Boolean(communityId),
  });
}

export const CYCLE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Collecting',
  CLOSED: 'Closed',
  SLOTS_PUBLISHED: 'Slots published',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** ADM-08: repeatable demand cycles per community; the initial % is locked at publication. */
export function CyclesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const [status, setStatus] = useState('');
  const cycles = useQuery({
    queryKey: ['demand-cycles', communityId],
    queryFn: () => api<{ items: DemandCycle[] }>(`/v1/admin/communities/${communityId}/demand-cycles`),
    enabled: Boolean(communityId),
  });
  const [creating, setCreating] = useState(false);
  const all = cycles.data?.items;
  const rows = useMemo(() => (status ? all?.filter((c) => c.status === status) : all), [all, status]);
  const collecting = all?.filter((c) => c.status === 'PUBLISHED') ?? [];
  const drafts = all?.filter((c) => c.status === 'DRAFT').length ?? 0;
  const commitments = (all ?? []).reduce((n, c) => n + c.committedCount, 0);
  const nextClose = collecting.map((c) => c.closesAt).sort()[0];

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Demand cycles"
        description="Collect paid demand before releasing slots. Each cycle has its own initial payment percentage, locked when it is published."
        actions={
          can(me, 'demand_payments', 'create') && communityId ? (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New cycle
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <FilterSelect value={status} onChange={setStatus} label="Stage" options={Object.entries(CYCLE_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
      </Toolbar>
      {all && all.length > 0 ? (
        <Facts
          items={[
            { label: 'Collecting now', value: collecting.length, note: nextClose ? `Next closes ${formatDateTime(nextClose)}` : undefined, icon: CalendarClock },
            { label: 'Drafts', value: drafts, note: drafts ? 'Not visible to residents' : undefined },
            { label: 'Paid commitments', value: commitments, note: 'Across all cycles', icon: HandCoins },
          ]}
        />
      ) : null}
      <Panel flush>
        <DataTable
          flush
          caption="Demand cycles"
          loading={cycles.isLoading}
          error={cycles.error}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/demand/cycles/${c.id}`)}
          emptyTitle={status ? 'No cycles at this stage' : 'No demand cycles yet'}
          emptyBody={
            status
              ? 'Clear the stage filter to see every cycle.'
              : 'Create a cycle for services that run in demand-led mode. It stays a draft until you publish it.'
          }
          columns={[
            {
              header: 'Cycle',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">
                    {c.planIds.length} {c.planIds.length === 1 ? 'plan' : 'plans'}
                  </span>
                </span>
              ),
            },
            {
              header: 'Collection window',
              cell: (c) => (
                <>
                  {formatDateTime(c.opensAt)}
                  <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                    to {formatDateTime(c.closesAt)}
                  </span>
                </>
              ),
            },
            { header: 'Initial %', className: 'num', cell: (c) => (c.initialPct === null ? <span className="muted">Not set</span> : `${c.initialPct}%`) },
            { header: 'Paid commitments', className: 'num', cell: (c) => c.committedCount },
            { header: 'Stage', cell: (c) => <Pill status={c.status} label={CYCLE_STATUS_LABEL[c.status]} /> },
          ]}
        />
      </Panel>
      {creating ? (
        <CycleEditor
          communityId={communityId}
          cycle={null}
          onClose={() => setCreating(false)}
          onSaved={(c) => navigate(`/demand/cycles/${c.id}`)}
        />
      ) : null}
    </>
  );
}

export function CycleEditor({
  communityId,
  cycle,
  onClose,
  onSaved,
}: {
  communityId: string;
  cycle: DemandCycle | null;
  onClose: () => void;
  onSaved?: (c: DemandCycle) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = usePublishedPlans(communityId);
  const [name, setName] = useState(cycle?.name ?? '');
  const [opensAt, setOpensAt] = useState(toLocalInput(cycle?.opensAt ?? new Date().toISOString()));
  const [closesAt, setClosesAt] = useState(toLocalInput(cycle?.closesAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [pct, setPct] = useState(cycle?.initialPct === null || cycle?.initialPct === undefined ? '' : String(cycle.initialPct));
  const [planIds, setPlanIds] = useState<string[]>(cycle?.planIds ?? []);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, opensAt: fromLocalInput(opensAt), closesAt: fromLocalInput(closesAt), initialPct: pct ? Number(pct) : null, planIds };
      return cycle
        ? api<DemandCycle>(`/v1/admin/demand-cycles/${cycle.id}`, { method: 'PATCH', body: { ...body, version: cycle.version } })
        : api<DemandCycle>(`/v1/admin/communities/${communityId}/demand-cycles`, { method: 'POST', body });
    },
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['demand-cycles'] });
      qc.setQueryData(['demand-cycle', c.id], c);
      toast(cycle ? 'Draft saved' : 'Draft cycle created');
      onClose();
      onSaved?.(c);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      wide
      title={cycle ? 'Edit draft cycle' : 'New demand cycle'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()} disabled={!name.trim()}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="stack">
        <InfoBanner>Nothing is visible to residents until you publish. After publishing, the percentage, plans and opening time are locked.</InfoBanner>
        <TextInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} hint="e.g. “December 2026 – Maid”" />
        <div className="grid-2">
          <TextInput label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} error={err?.field('opensAt')} />
          <TextInput label="Closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} error={err?.field('closesAt')} />
        </div>
        <TextInput
          label="Initial payment %"
          type="number"
          min={1}
          max={99}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          error={err?.field('initialPct')}
          hint="Whole number 1–99. Required to publish."
        />
        <fieldset className="field">
          <legend className="field-label">Eligible plans (published catalogue)</legend>
          {plans.isLoading ? <Spinner /> : null}
          <ErrorBanner error={plans.error} />
          {plans.data?.items.length === 0 ? <p className="muted">This community has no published catalogue yet. Publish a catalogue first, then add its plans here.</p> : null}
          {(plans.data?.items ?? []).map((p) => (
            <label key={p.id} className="checkbox">
              <input
                type="checkbox"
                checked={planIds.includes(p.id)}
                onChange={(e) => setPlanIds(e.target.checked ? [...planIds, p.id] : planIds.filter((x) => x !== p.id))}
              />
              <span>
                {p.name}{' '}
                <span className="muted">
                  ({p.code}, {p.validityDays} days)
                </span>
              </span>
            </label>
          ))}
          {err?.field('planIds') ? <p className="field-error">{err.field('planIds')}</p> : null}
        </fieldset>
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}
