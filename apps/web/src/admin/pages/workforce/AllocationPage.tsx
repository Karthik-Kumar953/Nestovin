'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationNeed, Candidates, Occurrence } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useSearchParams } from '../../lib/router';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Facts,
  formatDate,
  InfoBanner,
  PageHeader,
  Panel,
  Segmented,
  Skeleton,
  Spinner,
  StatusBadge,
  TextArea,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CalendarClock, Clock, Hourglass, MapPin, Send, Shuffle, UserCheck, UserX, Users } from '../../components/icons';
import { CommunityPicker, daysLabel, useSelectedCommunity } from '../demand/shared';
import { OfferOvertimeDialog } from './OvertimePage';
import { addDays, dayLabel, DayRunSheet, istDate, istTime, RunSheetLegend, STATE_LABEL, visitState } from './visits';

function NoCommunities() {
  return (
    <EmptyState title="No communities yet" icon={MapPin}>
      Add a community under Locations first.
    </EmptyState>
  );
}

/** Eligible vs excluded workers, with the reasons others cannot be chosen. */
function CandidateLists({
  cands,
  currentId,
  pickLabel,
  busyId,
  disabled,
  disabledHint,
  onPick,
  showLoad,
}: {
  cands: { data?: Candidates | undefined; isLoading: boolean; error: unknown };
  currentId?: string | undefined;
  pickLabel: string;
  busyId?: string | undefined;
  disabled?: boolean;
  disabledHint?: string | undefined;
  onPick: (c: Candidates['eligible'][number]) => void;
  showLoad?: boolean;
}) {
  if (cands.isLoading)
    return (
      <div className="stack-sm" aria-busy>
        <Skeleton height={18} />
        <Skeleton height={18} />
        <Skeleton height={18} />
        <span className="sr-only">Loading candidates</span>
      </div>
    );
  if (cands.error) return <ErrorBanner error={cands.error} />;
  if (!cands.data) return null;
  const { eligible, excluded } = cands.data;
  return (
    <div className="stack">
      <Panel title={`Eligible (${eligible.length})`} subtitle="No ranking: choose any eligible worker." flush>
        <DataTable
          flush
          caption="Eligible workers"
          rows={eligible}
          rowKey={(c) => c.employeeId}
          emptyTitle="No eligible workers"
          emptyBody="Check readiness, qualifications, availability and home cluster under Employees."
          columns={[
            {
              header: 'Worker',
              cell: (c) => (
                <span className="primary-cell">
                  {c.fullName}
                  <span className="sub">
                    {c.employeeCode}
                    {showLoad ? ` · ${c.currentStandingCount} current ${c.currentStandingCount === 1 ? 'service' : 'services'}` : ''}
                  </span>
                  {c.conflicts.length ? (
                    <span className="sub" style={{ color: 'var(--amber)' }}>
                      Date conflicts: {c.conflicts.join('; ')}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              header: 'Actions',
              className: 'actions',
              cell: (c) =>
                c.employeeId === currentId ? (
                  <span className="badge badge-teal">Current</span>
                ) : (
                  <Button size="sm" busy={busyId === c.employeeId} disabled={disabled} title={disabled ? disabledHint : undefined} onClick={() => onPick(c)}>
                    {pickLabel}
                  </Button>
                ),
            },
          ]}
        />
      </Panel>
      {excluded.length ? (
        <Panel title={`Not eligible (${excluded.length})`} subtitle="Why each worker can’t be chosen." flush>
          <DataTable
            flush
            caption="Workers not eligible"
            rows={excluded}
            rowKey={(c) => c.employeeId}
            columns={[
              {
                header: 'Worker',
                cell: (c) => (
                  <span className="primary-cell">
                    {c.fullName}
                    <span className="sub">{c.employeeCode}</span>
                  </span>
                ),
              },
              { header: 'Why', cell: (c) => <span className="muted">{c.reasons.join('; ')}</span> },
            ]}
          />
        </Panel>
      ) : null}
    </div>
  );
}

/** ADM-11: give every paid service a standing worker. No ranking (OPEN): pick from the eligible list. */
export function AllocationPage() {
  const me = useMe();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const unassigned = show === 'open';
  const needs = useQuery({
    queryKey: ['allocation-needs', communityId, unassigned],
    queryFn: () => api<{ items: AllocationNeed[] }>(`/v1/admin/allocation/needs${qs({ communityId, unassigned: String(unassigned) })}`),
    enabled: Boolean(communityId),
  });
  const [choosing, setChoosing] = useState<AllocationNeed | null>(null);
  if (loading) return <Spinner />;
  const items = needs.data?.items;
  const open = items?.filter((n) => !n.standing).length ?? 0;
  return (
    <>
      <PageHeader
        title="Allocation"
        description="Each paid service needs a standing worker. The service becomes active once every part of it is staffed. Only eligible workers are offered."
        actions={
          <ButtonLink to={`/allocation/visits${communityId ? `?communityId=${communityId}` : ''}`} icon={CalendarClock}>
            Visits
          </ButtonLink>
        }
      />
      {!communities?.length ? (
        <NoCommunities />
      ) : (
        <div className="stack">
          <Toolbar>
            <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
            <Segmented
              label="Which services"
              value={show}
              onChange={setShow}
              items={[
                { value: 'open', label: 'Needs a worker' },
                { value: 'all', label: 'All current services' },
              ]}
            />
          </Toolbar>
          {items ? (
            <Facts
              items={[
                { label: unassigned ? 'Need a worker' : 'Current services', value: items.length, tone: unassigned && items.length ? 'amber' : undefined, icon: unassigned ? UserX : Users },
                ...(unassigned ? [] : [{ label: 'Need a worker', value: open, tone: open ? ('amber' as const) : undefined, icon: UserX }]),
                ...(unassigned ? [] : [{ label: 'Staffed', value: items.length - open, icon: UserCheck }]),
              ]}
            />
          ) : null}
          <Panel flush>
            <DataTable
              flush
              caption="Services to staff"
              loading={needs.isLoading}
              error={needs.error}
              rows={items}
              rowKey={(n) => n.componentId}
              onRowClick={can(me, 'allocation', 'approve') ? setChoosing : undefined}
              emptyTitle={unassigned ? 'Every service has a worker' : 'No current services'}
              emptyBody={unassigned ? 'New paid services appear here when they need a standing worker.' : 'Services appear once residents’ bookings are paid.'}
              columns={[
                {
                  header: 'Household',
                  cell: (n) => (
                    <span className="primary-cell">
                      {n.residentName ?? 'Resident'}
                      <span className="sub">
                        {n.flat.towerName} · {n.flat.flatNumber}
                      </span>
                    </span>
                  ),
                },
                {
                  header: 'Service',
                  cell: (n) => (
                    <span className="primary-cell" style={{ fontWeight: 400 }}>
                      {n.serviceName}
                      <span className="sub">
                        {n.startTime} · {n.durationMinutes} min · {daysLabel(n.daysOfWeek)}
                      </span>
                    </span>
                  ),
                },
                { header: 'Period', cell: (n) => `${formatDate(n.periodStart)} – ${formatDate(n.periodEnd)}` },
                {
                  header: 'Standing worker',
                  cell: (n) =>
                    n.standing ? (
                      <span className="primary-cell" style={{ fontWeight: 400 }}>
                        {n.standing.employeeName}
                        <span className="sub">
                          {n.standing.employeeCode} · from {formatDate(n.standing.effectiveFrom)}
                        </span>
                      </span>
                    ) : (
                      <span className="badge badge-warning">Needs a worker</span>
                    ),
                },
                {
                  header: 'Actions',
                  className: 'actions',
                  cell: (n) =>
                    can(me, 'allocation', 'approve') ? (
                      <Button size="sm" variant={n.standing ? 'secondary' : 'primary'} onClick={() => setChoosing(n)}>
                        {n.standing ? 'Replace' : 'Assign'}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </Panel>
        </div>
      )}
      {choosing ? <CandidatesDrawer need={choosing} onClose={() => setChoosing(null)} /> : null}
    </>
  );
}

function CandidatesDrawer({ need, onClose }: { need: AllocationNeed; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const cands = useQuery({ queryKey: ['candidates', need.componentId], queryFn: () => api<Candidates>(`/v1/admin/allocation/components/${need.componentId}/candidates`) });
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ name: string; assignedVisits: number; gaps: string[] } | null>(null);
  const assign = useMutation({
    mutationFn: (v: { employeeId: string; name: string }) =>
      api<{ assignedVisits: number; gaps: string[] }>(`/v1/admin/allocation/components/${need.componentId}/standing`, {
        method: 'POST',
        body: { employeeId: v.employeeId, reason: reason.trim() || undefined },
      }),
    onSuccess: async (r, v) => {
      setResult({ name: v.name, ...r });
      toast(`${v.name} is now the standing worker`);
      await qc.invalidateQueries({ queryKey: ['allocation-needs'] });
      await qc.invalidateQueries({ queryKey: ['visits'] });
      await qc.invalidateQueries({ queryKey: ['candidates', need.componentId] });
    },
  });
  const where = `${need.serviceName}, ${need.flat.towerName} ${need.flat.flatNumber}`;
  async function pick(c: Candidates['eligible'][number]) {
    const r = await confirm({
      title: need.standing ? `Replace ${need.standing.employeeName} with ${c.fullName}?` : `Assign ${c.fullName}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {c.fullName} becomes the standing worker for {where} ({need.startTime}, {daysLabel(need.daysOfWeek)}) and is assigned the upcoming visits in
            this service period.
          </p>
          {need.standing ? <p style={{ margin: 0 }}>{need.standing.employeeName} stops being the standing worker for this service. This is a permanent change.</p> : null}
          {c.conflicts.length ? <p style={{ margin: 0, color: 'var(--amber)' }}>Date conflicts: {c.conflicts.join('; ')}. Those days will show as gaps under Visits.</p> : null}
        </div>
      ),
      confirmLabel: need.standing ? 'Replace worker' : 'Assign worker',
      tone: need.standing ? 'warning' : 'default',
    });
    if (r.ok) assign.mutate({ employeeId: c.employeeId, name: c.fullName });
  }
  return (
    <Drawer
      open
      title={need.standing ? 'Replace standing worker' : 'Assign standing worker'}
      subtitle={where}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="stack">
        <dl className="details" style={{ margin: 0 }}>
          <div>
            <dt>Household</dt>
            <dd>
              {need.residentName ?? 'Resident'} · {need.flat.towerName} {need.flat.flatNumber}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {need.startTime} · {need.durationMinutes} min
            </dd>
          </div>
          <div>
            <dt>Days</dt>
            <dd>{daysLabel(need.daysOfWeek)}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>
              {formatDate(need.periodStart)} – {formatDate(need.periodEnd)}
            </dd>
          </div>
          <div>
            <dt>Standing worker</dt>
            <dd>{need.standing ? `${need.standing.employeeName} (${need.standing.employeeCode})` : <span className="badge badge-warning">Needs a worker</span>}</dd>
          </div>
        </dl>
        {result ? (
          <InfoBanner tone={result.gaps.length ? 'warning' : 'success'}>
            {result.name} is assigned to {result.assignedVisits} upcoming {result.assignedVisits === 1 ? 'visit' : 'visits'}.
            {result.gaps.length ? ` Some days could not be assigned and show as gaps under Visits: ${result.gaps.join('; ')}.` : ''}{' '}
            {result.gaps.length ? <Link to="/allocation/visits?gaps=1">Open gaps</Link> : null}
          </InfoBanner>
        ) : null}
        <ErrorBanner error={assign.error} />
        {need.standing && !result ? (
          <TextArea label="Reason for the permanent replacement (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} hint="Recorded in the audit history." />
        ) : null}
        <CandidateLists
          cands={cands}
          currentId={need.standing?.employeeId}
          pickLabel={need.standing ? 'Replace' : 'Assign'}
          busyId={assign.isPending ? assign.variables?.employeeId : undefined}
          disabled={Boolean(result)}
          disabledHint="Already assigned. Close and reopen to change again."
          onPick={(c) => void pick(c)}
          showLoad
        />
      </div>
    </Drawer>
  );
}

/* ---------------------------------------------------------------- visits */

function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const isDate = (s: string | null): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

/** Visits in a date range, grouped by day, with gaps and one-day cover. */
export function VisitsPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const today = istDate(0);
  const [from, setFrom] = useState(() => (isDate(params.get('from')) ? params.get('from')! : today));
  const [to, setTo] = useState(() => (isDate(params.get('to')) ? params.get('to')! : addDays(isDate(params.get('from')) ? params.get('from')! : today, 6)));
  const [show, setShow] = useState<'all' | 'gaps'>(params.get('gaps') === '1' ? 'gaps' : 'all');
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const now = useNow();
  const rangeOk = Boolean(from && to && to >= from);
  const visits = useQuery({
    queryKey: ['visits', communityId, from, to, show],
    queryFn: () => api<{ items: Occurrence[] }>(`/v1/admin/visits${qs({ communityId, from, to, unassigned: String(show === 'gaps') })}`),
    enabled: Boolean(communityId) && rangeOk,
  });
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [offering, setOffering] = useState<Occurrence | null>(null);

  const days = useMemo(() => {
    const by = new Map<string, Occurrence[]>();
    for (const v of visits.data?.items ?? []) by.set(v.scheduledDate, [...(by.get(v.scheduledDate) ?? []), v]);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visits.data]);

  if (loading) return <Spinner />;
  const all = visits.data?.items ?? [];
  const states = all.map((v) => visitState(v, now));
  const count = (s: string) => states.filter((x) => x === s).length;
  const setPreset = (n: number) => {
    setFrom(today);
    setTo(addDays(today, n - 1));
  };

  return (
    <>
      <PageHeader
        title="Visits"
        description={
          rangeOk
            ? `${from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}. Gaps (no worker) need a one-day cover; permanent changes are made under Allocation.`
            : 'Choose a date range.'
        }
        actions={
          <ButtonLink to={`/allocation${communityId ? `?communityId=${communityId}` : ''}`} icon={Shuffle}>
            Allocation
          </ButtonLink>
        }
      />
      {!communities?.length ? (
        <NoCommunities />
      ) : (
        <div className="stack">
          <Toolbar>
            <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input className="input input-compact" type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted" aria-hidden>
                –
              </span>
              <input className="input input-compact" type="date" aria-label="To date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
            </span>
            <span className="row" style={{ gap: 4 }}>
              <Button variant="ghost" size="sm" onClick={() => setPreset(1)}>
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreset(7)}>
                Next 7 days
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreset(14)}>
                14 days
              </Button>
            </span>
            <Segmented
              label="Which visits"
              value={show}
              onChange={setShow}
              items={[
                { value: 'all', label: 'All visits' },
                { value: 'gaps', label: 'Only gaps' },
              ]}
            />
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              items={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'list', label: 'List' },
              ]}
            />
          </Toolbar>
          {!rangeOk ? <InfoBanner tone="warning">The To date must be on or after the From date.</InfoBanner> : null}
          {visits.data ? (
            <Facts
              items={[
                { label: show === 'gaps' ? 'Gaps' : 'Visits', value: all.length, note: `${days.length} ${days.length === 1 ? 'day' : 'days'}`, icon: CalendarClock },
                { label: 'No worker', value: count('unassigned'), tone: count('unassigned') ? 'amber' : undefined, note: 'Need a one-day cover', icon: UserX },
                ...(show === 'all'
                  ? [
                      { label: 'Done', value: count('done'), icon: UserCheck },
                      { label: 'No-shows', value: count('noshow'), tone: count('noshow') ? ('red' as const) : undefined, icon: Hourglass },
                    ]
                  : []),
              ]}
            />
          ) : null}
          {visits.error ? <ErrorBanner error={visits.error} /> : null}
          {visits.isLoading && rangeOk ? (
            <Panel>
              <div className="stack-sm" aria-busy>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={40} />
                ))}
              </div>
            </Panel>
          ) : null}
          {visits.data && days.length === 0 ? (
            <Panel>
              <EmptyState title={show === 'gaps' ? 'No gaps in this period' : 'No visits in this period'} icon={CalendarClock}>
                {show === 'gaps' ? 'Every visit in this range has a worker.' : 'Try a wider date range, or check Allocation for services without a worker.'}
              </EmptyState>
            </Panel>
          ) : null}
          {days.map(([date, list], i) => {
            const gaps = list.filter((v) => !v.assignment).length;
            return (
              <Panel
                key={date}
                title={
                  <>
                    {dayLabel(date)}
                    {date === today ? <span className="badge badge-teal" style={{ marginLeft: 8 }}>Today</span> : null}
                  </>
                }
                subtitle={`${list.length} ${list.length === 1 ? 'visit' : 'visits'}${gaps ? ` · ${gaps} without a worker` : ''}`}
                flush
              >
                {view === 'timeline' ? (
                  <>
                    {i === 0 ? <RunSheetLegend states={['done', 'progress', 'upcoming', 'late', 'noshow', 'unassigned']} /> : null}
                    <DayRunSheet visits={list} now={now} onSelect={setSelected} label={`Visits on ${dayLabel(date)} by worker and time`} />
                  </>
                ) : (
                  <DataTable
                    flush
                    caption={`Visits on ${dayLabel(date)}`}
                    rows={list.slice().sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))}
                    rowKey={(v) => v.id}
                    onRowClick={setSelected}
                    columns={[
                      {
                        header: 'Time',
                        cell: (v) => (v.startsAt ? `${istTime(v.startsAt)} – ${istTime(v.endsAt)}` : <span className="muted">Visit {v.visitNo}: time to be set</span>),
                      },
                      {
                        header: 'Household',
                        cell: (v) => (
                          <span className="primary-cell">
                            {v.residentName ?? 'Resident'}
                            <span className="sub">
                              {v.flat.towerName} · {v.flat.flatNumber} · {v.serviceName}
                            </span>
                          </span>
                        ),
                      },
                      {
                        header: 'Worker',
                        cell: (v) =>
                          v.assignment ? (
                            <span className="primary-cell" style={{ fontWeight: 400 }}>
                              {v.assignment.employeeName}
                              <span className="sub">
                                {v.assignment.employeeCode} · {v.assignment.source.toLowerCase().replace(/_/g, ' ')}
                              </span>
                            </span>
                          ) : (
                            <span className="badge badge-warning">No worker</span>
                          ),
                      },
                      { header: 'Status', cell: (v) => <VisitStateBadge v={v} now={now} /> },
                      {
                        header: 'Actions',
                        className: 'actions',
                        cell: (v) =>
                          canChange(me, v) ? (
                            <Button size="sm" variant={v.assignment ? 'secondary' : 'primary'} onClick={() => setSelected(v)}>
                              {v.assignment ? 'Replace' : 'Cover'}
                            </Button>
                          ) : null,
                      },
                    ]}
                  />
                )}
              </Panel>
            );
          })}
        </div>
      )}
      {selected ? (
        <VisitDrawer
          visit={selected}
          now={now}
          onClose={() => setSelected(null)}
          onOffer={() => {
            setOffering(selected);
            setSelected(null);
          }}
        />
      ) : null}
      {offering ? (
        <OfferOvertimeDialog
          occurrenceId={offering.id}
          title={`${dayLabel(offering.scheduledDate)}, ${offering.flat.towerName} ${offering.flat.flatNumber}`}
          onClose={() => setOffering(null)}
        />
      ) : null}
    </>
  );
}

const canChange = (me: Parameters<typeof can>[0], v: Occurrence) => can(me, 'allocation', 'edit') && ['SCHEDULED', 'ASSIGNED'].includes(v.status) && Boolean(v.startsAt);

function VisitStateBadge({ v, now }: { v: Occurrence; now: number }) {
  const s = visitState(v, now);
  const tone = s === 'done' ? 'success' : s === 'progress' ? 'teal' : s === 'late' || s === 'unassigned' ? 'warning' : s === 'noshow' ? 'error' : s === 'exception' ? 'violet' : 'neutral';
  return <StatusBadge status={STATE_LABEL[s]} tone={tone} />;
}

function VisitDrawer({ visit, now, onClose, onOffer }: { visit: Occurrence; now: number; onClose: () => void; onOffer: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const changeable = canChange(me, visit);
  const [picking, setPicking] = useState(false);
  const [reason, setReason] = useState('');
  const cands = useQuery({
    queryKey: ['visit-candidates', visit.id],
    queryFn: () => api<Candidates>(`/v1/admin/visits/${visit.id}/candidates`),
    enabled: picking,
  });
  const assign = useMutation({
    mutationFn: (v: { employeeId: string; name: string }) => api(`/v1/admin/visits/${visit.id}/assign`, { method: 'POST', body: { employeeId: v.employeeId, reason: reason.trim() } }),
    onSuccess: async (_r, v) => {
      toast(`${v.name} assigned for ${dayLabel(visit.scheduledDate)}`);
      await qc.invalidateQueries({ queryKey: ['visits'] });
      await qc.invalidateQueries({ queryKey: ['home-visits'] });
      onClose();
    },
  });
  const where = `${visit.serviceName} · ${visit.flat.towerName} ${visit.flat.flatNumber}`;
  async function pick(c: Candidates['eligible'][number]) {
    const r = await confirm({
      title: visit.assignment ? `Replace ${visit.assignment.employeeName} for this visit?` : `Cover this visit with ${c.fullName}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {c.fullName} is assigned to {where} on {dayLabel(visit.scheduledDate)} at {istTime(visit.startsAt)} only.
          </p>
          <p style={{ margin: 0 }}>
            {visit.assignment ? `${visit.assignment.employeeName} is removed from this one visit. ` : ''}The standing worker for the service does not change; use Allocation for a
            permanent change.
          </p>
        </div>
      ),
      confirmLabel: visit.assignment ? 'Replace for this visit' : 'Assign cover',
      tone: visit.assignment ? 'warning' : 'default',
    });
    if (r.ok) assign.mutate({ employeeId: c.employeeId, name: c.fullName });
  }
  return (
    <Drawer
      open
      title={where}
      subtitle={`${dayLabel(visit.scheduledDate)} · ${visit.startsAt ? `${istTime(visit.startsAt)} – ${istTime(visit.endsAt)}` : `Visit ${visit.visitNo}: time to be set`}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {changeable && !visit.assignment && can(me, 'allocation', 'create') ? (
            <Button variant="secondary" icon={Send} onClick={onOffer}>
              Offer overtime
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <dl className="details" style={{ margin: 0 }}>
          <div>
            <dt>Status</dt>
            <dd>
              <VisitStateBadge v={visit} now={now} />
            </dd>
          </div>
          <div>
            <dt>Household</dt>
            <dd>
              {visit.residentName ?? 'Resident'} · {visit.flat.towerName} {visit.flat.flatNumber}
            </dd>
          </div>
          <div>
            <dt>Community</dt>
            <dd>{visit.flat.communityName}</dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>
              {visit.assignment ? (
                <>
                  {visit.assignment.employeeName} ({visit.assignment.employeeCode})
                  <span className="muted"> · {visit.assignment.source.toLowerCase().replace(/_/g, ' ')}</span>
                </>
              ) : (
                <span className="badge badge-warning">No worker</span>
              )}
            </dd>
          </div>
        </dl>
        {!changeable ? (
          <p className="muted" style={{ margin: 0 }}>
            <Clock size={14} aria-hidden /> {visit.startsAt ? 'This visit can no longer be reassigned.' : 'A worker can be assigned once the visit time is set.'}
          </p>
        ) : !picking ? (
          <div className="row">
            <Button icon={visit.assignment ? Shuffle : UserCheck} onClick={() => setPicking(true)}>
              {visit.assignment ? 'Replace for this day' : 'Find a one-day cover'}
            </Button>
          </div>
        ) : (
          <>
            <TextArea
              label="Reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              hint="Recorded in the audit history. Needed before you can assign."
            />
            <ErrorBanner error={assign.error} />
            <CandidateLists
              cands={cands}
              currentId={visit.assignment?.employeeId}
              pickLabel="Assign"
              busyId={assign.isPending ? assign.variables?.employeeId : undefined}
              disabled={reason.trim().length < 3}
              disabledHint="Enter a reason first"
              onPick={(c) => void pick(c)}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
