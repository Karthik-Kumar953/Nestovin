'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDemandRequest, DemandCycle, DemandSummary, SlotSet } from '@nestovin/contracts';
import { api, ApiError, formatRupees } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useParams } from '../../lib/router';
import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Facts,
  FilterSelect,
  formatDate,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CalendarClock, ChartColumn, Plus } from '../../components/icons';
import { CycleEditor, CYCLE_STATUS_LABEL, usePublishedPlans } from './CyclesPage';
import { SlotEditor } from './SlotsPage';
import { BarRows, daysLabel, fromLocalInput, Pill, REQUEST_STATUS_LABEL, StageIndicator, toLocalInput } from './shared';
import { RecordHistory } from '../../components/RecordHistory';

const STAGES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PUBLISHED', label: 'Published', note: 'Collecting demand' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'SLOTS_PUBLISHED', label: 'Slots published', note: 'Balance due' },
  { key: 'COMPLETED', label: 'Completed' },
];

const NEXT_STEP: Record<string, string> = {
  DRAFT: 'Check the name, window, plans and initial percentage, then publish to start collecting paid demand.',
  PUBLISHED: 'Residents can pay the initial amount until the window closes. You can extend the window or close it early.',
  CLOSED: 'Collection has stopped. Create a slot set, allocate paid commitments within each slot’s capacity, then approve and publish it.',
  SLOTS_PUBLISHED: 'Residents have been given their slots and pay the remaining balance by the deadline.',
  COMPLETED: 'This cycle is finished. Its records stay here for reference.',
};

export function CycleDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const cycle = useQuery({ queryKey: ['demand-cycle', id], queryFn: () => api<DemandCycle>(`/v1/admin/demand-cycles/${id}`) });
  const summary = useQuery({ queryKey: ['demand-cycle', id, 'summary'], queryFn: () => api<DemandSummary>(`/v1/admin/demand-cycles/${id}/summary`) });
  const plans = usePublishedPlans(cycle.data?.communityId ?? '');
  const [editing, setEditing] = useState(false);
  const [extending, setExtending] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['demand-cycle', id] });
  const act = useMutation({
    mutationFn: (v: { path: 'publish' | 'close'; done: string }) =>
      api<DemandCycle>(`/v1/admin/demand-cycles/${id}/${v.path}`, { method: 'POST', body: { version: cycle.data!.version } }),
    onSuccess: async (_d, v) => {
      await refresh();
      await qc.invalidateQueries({ queryKey: ['demand-cycles'] });
      toast(v.done);
    },
  });

  if (cycle.isLoading) return <Spinner />;
  if (cycle.error || !cycle.data) return <ErrorBanner error={cycle.error ?? new Error('Cycle not found')} />;
  const c = cycle.data;
  const publish = can(me, 'demand_payments', 'publish');
  const planNames = c.planIds.map((p) => plans.data?.items.find((x) => x.id === p)?.name ?? 'Plan from an earlier catalogue');
  const t = summary.data?.totals;
  const cancelled = c.status === 'CANCELLED';

  const onPublish = async () => {
    const r = await confirm({
      title: 'Publish this cycle?',
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            Residents of {c.communityName} can start paying for the {c.planIds.length === 1 ? 'eligible plan' : `${c.planIds.length} eligible plans`} from{' '}
            {formatDateTime(c.opensAt)}.
          </p>
          <p style={{ margin: 0 }}>
            <strong>This locks the initial payment percentage at {c.initialPct}%</strong>, the eligible plans and the opening time. They can’t be changed after publishing.
          </p>
        </div>
      ),
      confirmLabel: 'Publish cycle',
      tone: 'warning',
    });
    if (r.ok) act.mutate({ path: 'publish', done: 'Cycle published. Residents can now pay the initial amount.' });
  };
  const onClose = async () => {
    const r = await confirm({
      title: 'Close collection now?',
      body: `Residents will no longer be able to pay the initial amount for “${c.name}”. Its scheduled close was ${formatDateTime(c.closesAt)}. Paid commitments are kept for slot allocation. A closed cycle can’t be reopened.`,
      confirmLabel: 'Close now',
      tone: 'danger',
    });
    if (r.ok) act.mutate({ path: 'close', done: 'Collection closed' });
  };
  const onCancelDraft = async () => {
    const r = await confirm({
      title: 'Cancel this draft?',
      body: `“${c.name}” was never visible to residents. It will be marked cancelled and can’t be edited or published afterwards.`,
      confirmLabel: 'Cancel draft',
      tone: 'danger',
    });
    if (r.ok) act.mutate({ path: 'close', done: 'Draft cancelled' });
  };

  return (
    <>
      <PageHeader
        crumb={{ to: `/demand/cycles?communityId=${c.communityId}`, label: 'Demand cycles' }}
        title={c.name}
        description={`${c.communityName} · ${formatDateTime(c.opensAt)} to ${formatDateTime(c.closesAt)}`}
        actions={
          <>
            {c.status === 'DRAFT' && publish ? (
              <Button variant="ghost" busy={act.isPending && act.variables?.path === 'close'} onClick={() => void onCancelDraft()}>
                Cancel draft
              </Button>
            ) : null}
            {c.status === 'DRAFT' && can(me, 'demand_payments', 'edit') ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
            ) : null}
            {c.status === 'DRAFT' && publish ? (
              <Button
                busy={act.isPending && act.variables?.path === 'publish'}
                disabled={c.initialPct === null}
                title={c.initialPct === null ? 'Set the initial payment percentage first' : undefined}
                onClick={() => void onPublish()}
              >
                Publish cycle
              </Button>
            ) : null}
            {c.status === 'PUBLISHED' && publish ? (
              <>
                <Button variant="secondary" icon={CalendarClock} onClick={() => setExtending(true)}>
                  Extend
                </Button>
                <Button variant="danger" busy={act.isPending} onClick={() => void onClose()}>
                  Close now
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="stack">
        <Panel>
          <div className="stack-sm">
            <StageIndicator stages={STAGES} current={c.status} halted={cancelled} label="Cycle stage" />
            {cancelled ? (
              <InfoBanner tone="warning">This cycle was cancelled before it was published. Nothing was shown to residents.</InfoBanner>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {NEXT_STEP[c.status]}
              </p>
            )}
            {c.status === 'DRAFT' && c.initialPct === null && publish ? (
              <InfoBanner tone="warning">Set the initial payment percentage in “Edit draft” before publishing.</InfoBanner>
            ) : null}
          </div>
        </Panel>
        <ErrorBanner error={act.error} />

        <div className="split">
          <div className="stack" style={{ minWidth: 0 }}>
            <DemandPanel summary={summary.data} loading={summary.isLoading} error={summary.error} />
            {c.status !== 'DRAFT' && !cancelled ? <SlotSetSection cycle={c} /> : null}
            <RequestsTable cycleId={c.id} />
          </div>
          <Panel title="Cycle details">
            <dl className="kv">
              <dt>Stage</dt>
              <dd>
                <Pill status={c.status} label={CYCLE_STATUS_LABEL[c.status]} />
              </dd>
              <dt>Initial payment</dt>
              <dd>{c.initialPct === null ? <span className="muted">Not set</span> : `${c.initialPct}%${c.status !== 'DRAFT' ? ' (locked)' : ''}`}</dd>
              <dt>Opens</dt>
              <dd>{formatDateTime(c.opensAt)}</dd>
              <dt>Closes</dt>
              <dd>{formatDateTime(c.closesAt)}</dd>
              <dt>Published</dt>
              <dd>{c.publishedAt ? formatDateTime(c.publishedAt) : <span className="muted">Not yet</span>}</dd>
              <dt>Eligible plans</dt>
              <dd>
                {planNames.length ? (
                  planNames.map((n, i) => (
                    <span key={`${n}-${i}`} className="chip">
                      {n}
                    </span>
                  ))
                ) : (
                  <span className="muted">None selected</span>
                )}
              </dd>
              {t ? (
                <>
                  <dt>Initial collected</dt>
                  <dd>{formatRupees(t.initialCollectedPaise)}</dd>
                </>
              ) : null}
            </dl>
          </Panel>
        </div>
        <RecordHistory targetType="demand_cycle" targetId={c.id} />
      </div>
      {editing ? <CycleEditor communityId={c.communityId} cycle={c} onClose={() => setEditing(false)} /> : null}
      {extending ? <ExtendCycle cycle={c} onClose={() => setExtending(false)} /> : null}
    </>
  );
}

function DemandPanel({ summary, loading, error }: { summary: DemandSummary | undefined; loading: boolean; error: unknown }) {
  if (error) return <ErrorBanner error={error} />;
  if (loading || !summary)
    return (
      <Panel title="Demand">
        <Skeleton height={120} />
      </Panel>
    );
  const t = summary.totals;
  const paid = t.committed + t.balanceDue + t.converted;
  return (
    <div className="stack">
      <Facts
        items={[
          { label: 'Paid commitments', value: paid, note: t.expired ? `${t.expired} expired` : 'Verified payments only' },
          { label: 'Awaiting initial payment', value: t.awaitingPayment },
          { label: 'Balance due', value: t.balanceDue, tone: t.balanceDue ? 'amber' : undefined },
          { label: 'Booked', value: t.converted },
          { label: 'Initial collected', value: formatRupees(t.initialCollectedPaise) },
        ]}
      />
      {t.reviewRequired ? (
        <InfoBanner tone="warning">
          {t.reviewRequired} {t.reviewRequired === 1 ? 'request needs' : 'requests need'} review because of a payment problem.{' '}
          <Link to="/demand/payments">Open the payments review queue</Link>.
        </InfoBanner>
      ) : null}
      <Panel title="Demand by plan option" subtitle="Households with a verified commitment" flush>
        {summary.bySelection.length === 0 ? (
          <EmptyState title="No paid commitments yet" icon={ChartColumn}>
            Commitments appear here once a resident’s initial payment is verified.
          </EmptyState>
        ) : (
          <BarRows
            label="Households by plan option"
            rows={summary.bySelection.map((r) => ({ key: `${r.planName}|${r.selectionLabel}`, name: r.planName, sub: r.selectionLabel, value: r.count }))}
          />
        )}
      </Panel>
      <Panel title="Demand by preferred time" subtitle="First choice and any choice" flush>
        <DataTable
          flush
          caption="Demand by preferred time"
          rows={summary.byPreferredWindow}
          rowKey={(r) => r.windowName}
          emptyTitle="No time preferences yet"
          columns={[
            { header: 'Time window', cell: (r) => <span className="primary-cell">{r.windowName}</span> },
            { header: 'First choice', className: 'num', cell: (r) => r.firstChoice },
            { header: 'Any choice', className: 'num', cell: (r) => r.anyChoice },
          ]}
        />
      </Panel>
    </div>
  );
}

function ExtendCycle({ cycle, onClose }: { cycle: DemandCycle; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [closesAt, setClosesAt] = useState(toLocalInput(cycle.closesAt));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/demand-cycles/${cycle.id}/extend`, { method: 'POST', body: { closesAt: fromLocalInput(closesAt), reason, version: cycle.version } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycle.id] });
      await qc.invalidateQueries({ queryKey: ['demand-cycles'] });
      toast('Collection window extended');
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const submit = async () => {
    const r = await confirm({
      title: 'Extend the collection window?',
      body: `Residents will be able to pay the initial amount until ${formatDateTime(fromLocalInput(closesAt))} instead of ${formatDateTime(cycle.closesAt)}. Your reason is kept in the cycle history.`,
      confirmLabel: 'Extend window',
      tone: 'warning',
    });
    if (r.ok) save.mutate();
  };
  return (
    <Modal
      open
      title="Extend collection window"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={reason.trim().length < 3 || !closesAt} onClick={() => void submit()}>
            Extend
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Currently closes {formatDateTime(cycle.closesAt)}.
        </p>
        <TextInput label="New closing time" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} error={err?.field('closesAt')} />
        <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

function RequestsTable({ cycleId }: { cycleId: string }) {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<AdminDemandRequest | null>(null);
  const list = useQuery({
    queryKey: ['demand-cycle', cycleId, 'requests', status],
    queryFn: () => api<{ items: AdminDemandRequest[] }>(`/v1/admin/demand-cycles/${cycleId}/requests${status ? `?status=${status}` : ''}`),
  });
  return (
    <Panel
      title="Requests"
      subtitle="Every household that started a request in this cycle"
      flush
      actions={<FilterSelect value={status} onChange={setStatus} label="Status" options={Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />}
    >
      <DataTable
        flush
        caption="Demand requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        emptyTitle={status ? 'No requests with this status' : 'No requests yet'}
        emptyBody={status ? 'Choose another status or clear the filter.' : 'Requests appear when residents start paying for this cycle.'}
        columns={[
          {
            header: 'Household',
            cell: (r) => (
              <span className="primary-cell">
                {r.resident.fullName ?? r.resident.phone}
                <span className="sub">
                  {r.flat.towerName} · {r.flat.flatNumber}
                </span>
              </span>
            ),
          },
          {
            header: 'Plan',
            cell: (r) => (
              <>
                {r.planName}
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                  {r.selectionLabel}
                </span>
              </>
            ),
          },
          { header: 'Preferred time', cell: (r) => r.preferredWindows.join(', ') || <span className="muted">None</span> },
          {
            header: 'Paid',
            className: 'num',
            cell: (r) => (
              <>
                {formatRupees(r.initialPaidPaise)}
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                  of {formatRupees(r.totalPaise)}
                </span>
              </>
            ),
          },
          { header: 'Status', cell: (r) => <Pill status={r.status} label={REQUEST_STATUS_LABEL[r.status]} /> },
        ]}
      />
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.resident.fullName ?? open?.resident.phone ?? 'Request'} subtitle={open ? `Reference ${open.reference}` : undefined}>
        {open ? (
          <dl className="kv">
            <dt>Status</dt>
            <dd>
              <Pill status={open.status} label={REQUEST_STATUS_LABEL[open.status]} />
            </dd>
            <dt>Phone</dt>
            <dd>{open.resident.phone}</dd>
            <dt>Flat</dt>
            <dd>
              {open.flat.towerName} · {open.flat.flatNumber}
              <span className="muted" style={{ display: 'block' }}>
                {open.flat.communityName}
              </span>
            </dd>
            <dt>Plan</dt>
            <dd>
              {open.planName} · {open.selectionLabel}
            </dd>
            <dt>Preferred times</dt>
            <dd>{open.preferredWindows.length ? open.preferredWindows.join(', ') : <span className="muted">None given</span>}</dd>
            <dt>Total</dt>
            <dd>{formatRupees(open.totalPaise)}</dd>
            <dt>Initial paid</dt>
            <dd>{formatRupees(open.initialPaidPaise)}</dd>
            <dt>Remaining</dt>
            <dd>{formatRupees(open.remainingDuePaise)}</dd>
            <dt>Slot allocated</dt>
            <dd>{open.allocatedSlotId ? 'Yes' : <span className="muted">Not yet</span>}</dd>
            <dt>Started</dt>
            <dd>{formatDateTime(open.createdAt)}</dd>
          </dl>
        ) : null}
      </Drawer>
    </Panel>
  );
}

function SlotSetSection({ cycle }: { cycle: DemandCycle }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
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
    onSuccess: async (_d, v) => {
      await invalidate();
      toast(v.slotId ? 'Allocation saved' : 'Allocation removed');
    },
  });
  const publishSet = useMutation({
    mutationFn: (s: SlotSet) => api(`/v1/admin/slot-sets/${s.id}/publish`, { method: 'POST', body: { version: s.version } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['demand-cycles'] });
      toast('Slot set approved and published');
    },
  });
  const draft = sets.data?.items.find((s) => s.status === 'DRAFT');
  const edit = can(me, 'demand_payments', 'edit');
  const waiting = committed.data?.items ?? [];
  const allocatedCount = waiting.filter((r) => r.allocatedSlotId).length;

  const onPublishSet = async (s: SlotSet) => {
    const allocated = s.slots.reduce((n, x) => n + x.used, 0);
    const r = await confirm({
      title: 'Approve and publish this slot set?',
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {allocated} {allocated === 1 ? 'household is' : 'households are'} allocated across {s.slots.length} {s.slots.length === 1 ? 'slot' : 'slots'}, starting{' '}
            {formatDate(s.commencementDate)}. They will be asked to pay the remaining balance by {formatDateTime(s.balanceDueAt)}.
          </p>
          {committed.data && waiting.length > allocatedCount ? (
            <p style={{ margin: 0 }}>
              <strong>
                {waiting.length - allocatedCount} paid {waiting.length - allocatedCount === 1 ? 'commitment is' : 'commitments are'} still not allocated
              </strong>{' '}
              to any slot.
            </p>
          ) : null}
          <p style={{ margin: 0 }}>Slots and allocations can’t be changed after publishing.</p>
        </div>
      ),
      confirmLabel: 'Approve and publish',
      tone: 'warning',
    });
    if (r.ok) publishSet.mutate(s);
  };

  return (
    <Panel
      title="Slots and commencement"
      subtitle="Create slots, allocate paid commitments within each slot’s capacity, then approve and publish. Residents then pay the remaining balance by the deadline."
      flush
      actions={
        !draft && can(me, 'demand_payments', 'create') ? (
          <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
            New slot set
          </Button>
        ) : null
      }
    >
      <div className="panel-body stack">
        <ErrorBanner error={error} />
        {sets.isLoading ? <Skeleton height={80} /> : null}
        <ErrorBanner error={sets.error} />
        {sets.data?.items.length === 0 ? (
          <EmptyState title="No slot sets yet" icon={CalendarClock}>
            Create a slot set with a commencement date and a balance deadline, then add slots to it.
          </EmptyState>
        ) : null}
        {(sets.data?.items ?? []).map((s) => (
          <div key={s.id} className="stack-sm">
            <div className="row-between">
              <div className="row">
                <Pill status={s.status} />
                <strong>Starts {formatDate(s.commencementDate)}</strong>
                <span className="muted">Balance due {formatDateTime(s.balanceDueAt)}</span>
              </div>
              <div className="row">
                {s.status === 'DRAFT' && edit ? (
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddingTo(s)}>
                    Add slot
                  </Button>
                ) : null}
                {s.status === 'DRAFT' && can(me, 'demand_payments', 'publish') ? (
                  <Button size="sm" busy={publishSet.isPending} disabled={s.slots.length === 0} onClick={() => void onPublishSet(s)}>
                    Approve and publish
                  </Button>
                ) : null}
                {s.status === 'PUBLISHED' && can(me, 'demand_payments', 'publish') ? (
                  <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setExtendSet(s)}>
                    Extend deadline
                  </Button>
                ) : null}
              </div>
            </div>
            <DataTable
              caption="Slots in this set"
              rows={s.slots}
              rowKey={(x) => x.id}
              emptyTitle="No slots in this set yet"
              emptyBody={s.status === 'DRAFT' && edit ? 'Add a slot to start allocating paid commitments.' : undefined}
              columns={[
                {
                  header: 'Slot',
                  cell: (x) => (
                    <span className="primary-cell">
                      {x.label}
                      <span className="sub">{x.serviceName ?? 'Any service'}</span>
                    </span>
                  ),
                },
                { header: 'Time', cell: (x) => `${x.startTime} · ${x.durationMinutes} min · ${daysLabel(x.daysOfWeek)}` },
                {
                  header: 'Allocated',
                  className: 'num',
                  cell: (x) => (
                    <span style={{ color: x.used >= x.capacity ? 'var(--amber)' : undefined }}>
                      {x.used} / {x.capacity}
                      {x.used >= x.capacity ? <span className="sub">Full</span> : null}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        ))}
      </div>
      {draft && draft.slots.length > 0 ? (
        <div className="stack-sm" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="panel-body" style={{ paddingBottom: 0 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Allocate paid commitments
            </h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {committed.data ? `${allocatedCount} of ${waiting.length} allocated. ` : ''}Changes save as you choose a slot.
            </p>
          </div>
          <DataTable
            flush
            caption="Paid commitments to allocate"
            loading={committed.isLoading}
            error={committed.error}
            rows={committed.data?.items}
            rowKey={(r) => r.id}
            emptyTitle="No paid commitments waiting for a slot"
            columns={[
              {
                header: 'Household',
                cell: (r) => (
                  <span className="primary-cell">
                    {r.resident.fullName ?? r.resident.phone}
                    <span className="sub">
                      {r.flat.towerName} · {r.flat.flatNumber}
                    </span>
                  </span>
                ),
              },
              { header: 'Plan', cell: (r) => `${r.planName} · ${r.selectionLabel}` },
              { header: 'Preferred', cell: (r) => r.preferredWindows.join(', ') || <span className="muted">None</span> },
              {
                header: 'Slot',
                cell: (r) =>
                  edit ? (
                    <select
                      className="input input-compact"
                      aria-label={`Slot for ${r.resident.fullName ?? r.reference}`}
                      value={r.allocatedSlotId ?? ''}
                      disabled={allocate.isPending && allocate.variables?.requestId === r.id}
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
                    (draft.slots.find((x) => x.id === r.allocatedSlotId)?.label ?? <span className="muted">Not allocated</span>)
                  ),
              },
            ]}
          />
        </div>
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
    </Panel>
  );
}

function CreateSet({ cycleId, onClose }: { cycleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [start, setStart] = useState(new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 5 * 86_400_000).toISOString()));
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/demand-cycles/${cycleId}/slot-sets`, { method: 'POST', body: { commencementDate: start, balanceDueAt: fromLocalInput(due) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycleId] });
      toast('Slot set created');
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <div className="stack">
        <InfoBanner>If the balance is not paid by the deadline, the commitment expires and the initial payment is kept (residents accepted this when paying).</InfoBanner>
        <TextInput label="Commencement date" type="date" value={start} onChange={(e) => setStart(e.target.value)} error={err?.field('commencementDate')} />
        <TextInput
          label="Balance deadline"
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          error={err?.field('balanceDueAt')}
          hint="Must be before the commencement date."
        />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

function ExtendDeadline({ set, cycleId, onClose }: { set: SlotSet; cycleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [due, setDue] = useState(toLocalInput(set.balanceDueAt));
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/slot-sets/${set.id}/extend-deadline`, { method: 'POST', body: { balanceDueAt: fromLocalInput(due), reason, version: set.version } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demand-cycle', cycleId] });
      toast('Balance deadline extended');
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const submit = async () => {
    const r = await confirm({
      title: 'Extend the balance deadline?',
      body: `Residents in this slot set will have until ${formatDateTime(fromLocalInput(due))} to pay the remaining balance, instead of ${formatDateTime(set.balanceDueAt)}. Your reason is kept in the history.`,
      confirmLabel: 'Extend deadline',
      tone: 'warning',
    });
    if (r.ok) save.mutate();
  };
  return (
    <Modal
      open
      title="Extend balance deadline"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={reason.trim().length < 3 || !due} onClick={() => void submit()}>
            Extend
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Slots start {formatDate(set.commencementDate)}. Balance currently due {formatDateTime(set.balanceDueAt)}.
        </p>
        <TextInput label="New deadline" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} error={err?.field('balanceDueAt')} />
        <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}
