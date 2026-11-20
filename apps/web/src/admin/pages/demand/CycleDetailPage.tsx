'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDemandRequest, DemandCycle, DemandSummary, SlotSet } from '@nestovin/contracts';
import { api, ApiError, formatRupees } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useParams } from '../../lib/router';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, Spinner, TextArea, TextInput } from '../../components/ui';
import { CycleEditor, usePublishedPlans } from './CyclesPage';
import { SlotEditor } from './SlotsPage';
import { daysLabel, fromLocalInput, Pill, REQUEST_STATUS_LABEL, toLocalInput } from './shared';

export function CycleDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const cycle = useQuery({ queryKey: ['demand-cycle', id], queryFn: () => api<DemandCycle>(`/v1/admin/demand-cycles/${id}`) });
  const summary = useQuery({ queryKey: ['demand-cycle', id, 'summary'], queryFn: () => api<DemandSummary>(`/v1/admin/demand-cycles/${id}/summary`) });
  const plans = usePublishedPlans(cycle.data?.communityId ?? '');
  const [editing, setEditing] = useState(false);
  const [extending, setExtending] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['demand-cycle', id] });
  const act = useMutation({
    mutationFn: (path: 'publish' | 'close') => api<DemandCycle>(`/v1/admin/demand-cycles/${id}/${path}`, { method: 'POST', body: { version: cycle.data!.version } }),
    onSuccess: async () => {
      await refresh();
      await qc.invalidateQueries({ queryKey: ['demand-cycles'] });
    },
  });

  if (cycle.isLoading) return <Spinner />;
  if (cycle.error || !cycle.data) return <ErrorBanner error={cycle.error ?? new Error('Cycle not found')} />;
  const c = cycle.data;
  const publish = can(me, 'demand_payments', 'publish');
  const planNames = c.planIds.map((p) => plans.data?.items.find((x) => x.id === p)?.name ?? 'Plan from an earlier catalogue');
  const t = summary.data?.totals;

  return (
    <>
      <p className="breadcrumb">
        <Link to={`/demand/cycles?communityId=${c.communityId}`}>Demand cycles</Link> / {c.name}
      </p>
      <PageHeader
        title={c.name}
        description={`${c.communityName} · ${formatDateTime(c.opensAt)} to ${formatDateTime(c.closesAt)}`}
        actions={
          <div className="row">
            {c.status === 'DRAFT' && can(me, 'demand_payments', 'edit') ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
            ) : null}
            {c.status === 'DRAFT' && publish ? (
              <Button busy={act.isPending} onClick={() => act.mutate('publish')}>
                Publish cycle
              </Button>
            ) : null}
            {c.status === 'PUBLISHED' && publish ? (
              <>
                <Button variant="secondary" onClick={() => setExtending(true)}>
                  Extend
                </Button>
                <Button variant="ghost" busy={act.isPending} onClick={() => act.mutate('close')}>
                  Close now
                </Button>
              </>
            ) : null}
            {c.status === 'DRAFT' && publish ? (
              <Button variant="ghost" busy={act.isPending} onClick={() => act.mutate('close')}>
                Cancel draft
              </Button>
            ) : null}
          </div>
        }
      />
      <ErrorBanner error={act.error} />
      <div className="card">
        <dl className="details">
          <div>
            <dt>Status</dt>
            <dd>
              <Pill status={c.status} />
            </dd>
          </div>
          <div>
            <dt>Initial payment</dt>
            <dd>{c.initialPct === null ? 'Not set' : `${c.initialPct}%${c.status !== 'DRAFT' ? ' (locked)' : ''}`}</dd>
          </div>
          <div>
            <dt>Eligible plans</dt>
            <dd>{planNames.length ? planNames.join(', ') : 'None selected'}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatDateTime(c.publishedAt)}</dd>
          </div>
        </dl>
      </div>

      {t ? (
        <div className="card">
          <h2 className="section-title">Demand</h2>
          <p className="muted">Only backend-verified payments count as commitments.</p>
          <dl className="details">
            <div><dt>Paid commitments</dt><dd><strong>{t.committed + t.balanceDue + t.converted}</strong></dd></div>
            <div><dt>Awaiting initial payment</dt><dd>{t.awaitingPayment}</dd></div>
            <div><dt>Balance due</dt><dd>{t.balanceDue}</dd></div>
            <div><dt>Booked</dt><dd>{t.converted}</dd></div>
            <div><dt>Expired</dt><dd>{t.expired}</dd></div>
            <div><dt>Needs review</dt><dd>{t.reviewRequired}</dd></div>
            <div><dt>Initial amount collected</dt><dd>{formatRupees(t.initialCollectedPaise)}</dd></div>
          </dl>
          <div className="split">
            <DataTable
              caption="By plan option"
              rows={summary.data!.bySelection}
              rowKey={(r) => `${r.planName}|${r.selectionLabel}`}
              emptyTitle="No paid commitments yet"
              columns={[
                { header: 'Plan', cell: (r) => r.planName },
                { header: 'Option', cell: (r) => r.selectionLabel },
                { header: 'Households', className: 'num', cell: (r) => r.count },
              ]}
            />
            <DataTable
              caption="By preferred time"
              rows={summary.data!.byPreferredWindow}
              rowKey={(r) => r.windowName}
              emptyTitle="No preferences yet"
              columns={[
                { header: 'Time window', cell: (r) => r.windowName },
                { header: 'First choice', className: 'num', cell: (r) => r.firstChoice },
                { header: 'Any choice', className: 'num', cell: (r) => r.anyChoice },
              ]}
            />
          </div>
        </div>
      ) : null}

      {c.status !== 'DRAFT' && c.status !== 'CANCELLED' ? <SlotSetSection cycle={c} /> : null}
      <RequestsTable cycleId={c.id} />
      {editing ? <CycleEditor communityId={c.communityId} cycle={c} onClose={() => setEditing(false)} /> : null}
      {extending ? <ExtendCycle cycle={c} onClose={() => setExtending(false)} /> : null}
    </>
  );
}

function ExtendCycle({ cycle, onClose }: { cycle: DemandCycle; onClose: () => void }) {
  const qc = useQueryClient();
  const [closesAt, setClosesAt] = useState(toLocalInput(cycle.closesAt));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/demand-cycles/${cycle.id}/extend`, { method: 'POST', body: { closesAt: fromLocalInput(closesAt), reason, version: cycle.version } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycle.id] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Extend collection window"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} disabled={reason.trim().length < 3} onClick={() => save.mutate()}>Extend</Button>
        </>
      }
    >
      <TextInput label="New closing time" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <ErrorBanner error={save.error} />
    </Modal>
  );
}

function RequestsTable({ cycleId }: { cycleId: string }) {
  const [status, setStatus] = useState('');
  const list = useQuery({
    queryKey: ['demand-cycle', cycleId, 'requests', status],
    queryFn: () => api<{ items: AdminDemandRequest[] }>(`/v1/admin/demand-cycles/${cycleId}/requests${status ? `?status=${status}` : ''}`),
  });
  return (
    <div className="card">
      <div className="page-header">
        <h2 className="section-title">Requests</h2>
        <select className="input input-compact" aria-label="Request status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(REQUEST_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <DataTable
        caption="Demand requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        emptyTitle="No requests"
        columns={[
          { header: 'Household', cell: (r) => <><strong>{r.resident.fullName ?? r.resident.phone}</strong><div className="muted">{r.flat.towerName} · {r.flat.flatNumber}</div></> },
          { header: 'Plan', cell: (r) => <>{r.planName}<div className="muted">{r.selectionLabel}</div></> },
          { header: 'Preferred time', cell: (r) => r.preferredWindows.join(', ') },
          { header: 'Paid / total', className: 'num', cell: (r) => <>{formatRupees(r.initialPaidPaise)}<div className="muted">of {formatRupees(r.totalPaise)}</div></> },
          { header: 'Status', cell: (r) => <Pill status={r.status} label={REQUEST_STATUS_LABEL[r.status]} /> },
          { header: 'Reference', cell: (r) => <span className="muted">{r.reference}</span> },
        ]}
      />
    </div>
  );
}

function SlotSetSection({ cycle }: { cycle: DemandCycle }) {
  const me = useMe();
  const qc = useQueryClient();
  const sets = useQuery({ queryKey: ['demand-cycle', cycle.id, 'slot-sets'], queryFn: () => api<{ items: SlotSet[] }>(`/v1/admin/demand-cycles/${cycle.id}/slot-sets`) });
  const committed = useQuery({
    queryKey: ['demand-cycle', cycle.id, 'requests', 'COMMITTED'],
    queryFn: () => api<{ items: AdminDemandRequest[] }>(`/v1/admin/demand-cycles/${cycle.id}/requests?status=COMMITTED`),
  });
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<SlotSet | null>(null);
  const [extendSet, setExtendSet] = useState<SlotSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['demand-cycle', cycle.id] });
  };
  const allocate = useMutation({
    mutationFn: (v: { setId: string; requestId: string; slotId: string | null }) =>
      api(`/v1/admin/slot-sets/${v.setId}/allocations`, { method: 'POST', body: { allocations: [{ requestId: v.requestId, slotId: v.slotId }] } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: invalidate,
  });
  const publishSet = useMutation({
    mutationFn: (s: SlotSet) => api(`/v1/admin/slot-sets/${s.id}/publish`, { method: 'POST', body: { version: s.version } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: invalidate,
  });
  const draft = sets.data?.items.find((s) => s.status === 'DRAFT');
  const edit = can(me, 'demand_payments', 'edit');

  return (
    <div className="card stack">
      <div className="page-header">
        <div>
          <h2 className="section-title">Slots and commencement</h2>
          <p className="muted">Create slots, allocate paid commitments within each slot’s capacity, then approve and publish. Residents then pay the remaining balance by the deadline.</p>
        </div>
        {!draft && can(me, 'demand_payments', 'create') ? <Button onClick={() => setCreating(true)}>New slot set</Button> : null}
      </div>
      <ErrorBanner error={error} />
      {sets.isLoading ? <Spinner /> : null}
      {(sets.data?.items ?? []).map((s) => (
        <div key={s.id} className="stack">
          <div className="row">
            <Pill status={s.status} />
            <span>Starts {s.commencementDate}</span>
            <span className="muted">· balance due {formatDateTime(s.balanceDueAt)}</span>
            {s.status === 'DRAFT' && edit ? <Button variant="secondary" onClick={() => setAddingTo(s)}>Add slot</Button> : null}
            {s.status === 'DRAFT' && can(me, 'demand_payments', 'publish') ? (
              <Button busy={publishSet.isPending} onClick={() => publishSet.mutate(s)}>Approve and publish</Button>
            ) : null}
            {s.status === 'PUBLISHED' && can(me, 'demand_payments', 'publish') ? (
              <Button variant="ghost" onClick={() => setExtendSet(s)}>Extend deadline</Button>
            ) : null}
          </div>
          <DataTable
            caption="Slots in this set"
            rows={s.slots}
            rowKey={(x) => x.id}
            emptyTitle="No slots in this set yet"
            columns={[
              { header: 'Slot', cell: (x) => <><strong>{x.label}</strong><div className="muted">{x.serviceName ?? 'Any service'}</div></> },
              { header: 'Time', cell: (x) => `${x.startTime} · ${x.durationMinutes} min · ${daysLabel(x.daysOfWeek)}` },
              { header: 'Allocated', className: 'num', cell: (x) => `${x.used} / ${x.capacity}` },
            ]}
          />
        </div>
      ))}
      {draft && draft.slots.length > 0 ? (
        <>
          <h3 className="section-title">Allocate paid commitments</h3>
          <DataTable
            caption="Paid commitments to allocate"
            loading={committed.isLoading}
            rows={committed.data?.items}
            rowKey={(r) => r.id}
            emptyTitle="No paid commitments waiting for a slot"
            columns={[
              { header: 'Household', cell: (r) => <>{r.resident.fullName ?? r.resident.phone}<div className="muted">{r.flat.towerName} · {r.flat.flatNumber}</div></> },
              { header: 'Plan', cell: (r) => `${r.planName} · ${r.selectionLabel}` },
              { header: 'Preferred', cell: (r) => r.preferredWindows.join(', ') },
              {
                header: 'Slot',
                cell: (r) =>
                  edit ? (
                    <select
                      className="input input-compact"
                      aria-label={`Slot for ${r.reference}`}
                      value={r.allocatedSlotId ?? ''}
                      onChange={(e) => allocate.mutate({ setId: draft.id, requestId: r.id, slotId: e.target.value || null })}
                    >
                      <option value="">Not allocated</option>
                      {draft.slots.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label} ({x.used}/{x.capacity})
                        </option>
                      ))}
                    </select>
                  ) : (
                    draft.slots.find((x) => x.id === r.allocatedSlotId)?.label ?? '—'
                  ),
              },
            ]}
          />
        </>
      ) : null}
      {creating ? <CreateSet cycleId={cycle.id} onClose={() => setCreating(false)} /> : null}
      {addingTo ? (
        <SlotEditor
          communityId={cycle.communityId}
          slot={null}
          createPath={`/v1/admin/slot-sets/${addingTo.id}/slots`}
          invalidate={['demand-cycle', cycle.id]}
          onClose={() => setAddingTo(null)}
        />
      ) : null}
      {extendSet ? <ExtendDeadline set={extendSet} cycleId={cycle.id} onClose={() => setExtendSet(null)} /> : null}
    </div>
  );
}

function CreateSet({ cycleId, onClose }: { cycleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 5 * 86_400_000).toISOString()));
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/demand-cycles/${cycleId}/slot-sets`, { method: 'POST', body: { commencementDate: start, balanceDueAt: fromLocalInput(due) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycleId] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title="New slot set"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} onClick={() => save.mutate()}>Create</Button>
        </>
      }
    >
      <InfoBanner>If the balance is not paid by the deadline, the commitment expires and the initial payment is kept (residents accepted this when paying).</InfoBanner>
      <TextInput label="Commencement date" type="date" value={start} onChange={(e) => setStart(e.target.value)} error={err?.field('commencementDate')} />
      <TextInput label="Balance deadline" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} error={err?.field('balanceDueAt')} hint="Must be before the commencement date." />
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}

function ExtendDeadline({ set, cycleId, onClose }: { set: SlotSet; cycleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [due, setDue] = useState(toLocalInput(set.balanceDueAt));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/slot-sets/${set.id}/extend-deadline`, { method: 'POST', body: { balanceDueAt: fromLocalInput(due), reason, version: set.version } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycleId] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Extend balance deadline"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} disabled={reason.trim().length < 3} onClick={() => save.mutate()}>Extend</Button>
        </>
      }
    >
      <TextInput label="New deadline" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <ErrorBanner error={save.error} />
    </Modal>
  );
}
