'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DemandCycle } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link } from '../../lib/router';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, Spinner, TextInput, Toolbar } from '../../components/ui';
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

/** ADM-08: repeatable demand cycles per community; the initial % is locked at publication. */
export function CyclesPage() {
  const me = useMe();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const cycles = useQuery({
    queryKey: ['demand-cycles', communityId],
    queryFn: () => api<{ items: DemandCycle[] }>(`/v1/admin/communities/${communityId}/demand-cycles`),
    enabled: Boolean(communityId),
  });
  const [creating, setCreating] = useState(false);
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Demand cycles"
        description="Collect paid demand before releasing slots. Each cycle has its own initial payment percentage, locked when it is published."
        actions={can(me, 'demand_payments', 'create') && communityId ? <Button onClick={() => setCreating(true)}>New cycle</Button> : null}
      />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
      </Toolbar>
      <DataTable
        caption="Demand cycles"
        loading={cycles.isLoading}
        error={cycles.error}
        rows={cycles.data?.items}
        rowKey={(c) => c.id}
        emptyTitle="No demand cycles"
        emptyBody="Create a cycle for services that run in demand-led mode."
        columns={[
          { header: 'Cycle', cell: (c) => <Link to={`/demand/cycles/${c.id}`}><strong>{c.name}</strong></Link> },
          { header: 'Collection window', cell: (c) => <>{formatDateTime(c.opensAt)}<div className="muted">to {formatDateTime(c.closesAt)}</div></> },
          { header: 'Initial %', className: 'num', cell: (c) => (c.initialPct === null ? '—' : `${c.initialPct}%`) },
          { header: 'Paid commitments', className: 'num', cell: (c) => c.committedCount },
          { header: 'Status', cell: (c) => <Pill status={c.status} /> },
        ]}
      />
      {creating ? <CycleEditor communityId={communityId} cycle={null} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

export function CycleEditor({ communityId, cycle, onClose }: { communityId: string; cycle: DemandCycle | null; onClose: () => void }) {
  const qc = useQueryClient();
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
      onClose();
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()} disabled={!name.trim()}>
            Save draft
          </Button>
        </>
      }
    >
      <InfoBanner>Nothing is visible to residents until you publish. After publishing, the percentage, plans and opening time are locked.</InfoBanner>
      <TextInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} hint="e.g. “December 2026 – Maid”" />
      <div className="row">
        <TextInput label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} error={err?.field('opensAt')} />
        <TextInput label="Closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} error={err?.field('closesAt')} />
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
      </div>
      <fieldset className="field">
        <legend className="field-label">Eligible plans (published catalogue)</legend>
        {plans.isLoading ? <Spinner /> : null}
        {plans.data?.items.length === 0 ? <p className="muted">This community has no published catalogue yet.</p> : null}
        {(plans.data?.items ?? []).map((p) => (
          <label key={p.id} className="checkbox">
            <input type="checkbox" checked={planIds.includes(p.id)} onChange={(e) => setPlanIds(e.target.checked ? [...planIds, p.id] : planIds.filter((x) => x !== p.id))} />
            <span>
              {p.name} <span className="muted">({p.code}, {p.validityDays} days)</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}
