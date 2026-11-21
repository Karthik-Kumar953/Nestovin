'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { AdminDashboard } from '@nestovin/contracts';
import { Link } from '../lib/router';
import { api } from '../lib/api';
import { useMe } from '../auth/AuthProvider';
import { can } from '../lib/permissions';
import { useQueueCounts } from '../components/Layout';
import { ButtonLink, EmptyState, ErrorBanner, Facts, Panel, Segmented, Skeleton, StatusBadge, formatPaise } from '../components/ui';
import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock,
  FileSpreadsheet,
  IndianRupee,
  LifeBuoy,
  ShieldCheck,
  Shuffle,
  UserX,
  type LucideIcon,
} from '../components/icons';

/* ---------- Visits (run sheet) ---------- */

interface Visit {
  id: string;
  scheduledDate: string;
  startsAt: string;
  endsAt: string;
  status: string;
  serviceName: string;
  flat: { flatNumber: string; towerName: string; communityName: string };
  residentName: string;
  assignment: { employeeName: string; employeeCode: string } | null;
}

type VisitState = 'done' | 'progress' | 'upcoming' | 'late' | 'noshow' | 'unassigned' | 'exception';

const LATE_GRACE_MIN = 10;

const STATE_LABEL: Record<VisitState, string> = {
  done: 'Done',
  progress: 'In progress',
  upcoming: 'Scheduled',
  late: 'Late',
  noshow: 'No-show',
  unassigned: 'Unassigned',
  exception: 'Exception',
};

function visitState(v: Visit, now: number): VisitState {
  if (v.status === 'COMPLETED') return 'done';
  if (v.status === 'NO_SHOW') return 'noshow';
  if (v.status === 'EXCEPTION') return 'exception';
  if (v.status === 'IN_PROGRESS' || v.status === 'COMPLETION_SUBMITTED') return 'progress';
  if (!v.assignment) return 'unassigned';
  if (new Date(v.startsAt).getTime() + LATE_GRACE_MIN * 60_000 < now) return 'late';
  return 'upcoming';
}

const IST = 'Asia/Kolkata';
function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function istHours(iso: string | number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}
function istTime(iso: string | number): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ---------- Page ---------- */

export function HomePage() {
  const me = useMe();
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const date = istDate(day === 'today' ? 0 : 1);
  const now = useNow();
  const canVisits = can(me, 'allocation');
  const { counts, dashboard } = useQueueCounts();

  const visits = useQuery({
    queryKey: ['home-visits', date],
    queryFn: () => api<{ items: Visit[] }>(`/v1/admin/visits?from=${date}&to=${date}`),
    enabled: canVisits,
    refetchInterval: day === 'today' ? 60_000 : false,
  });

  const rows = useMemo(() => {
    const list = (visits.data?.items ?? []).map((v) => ({ v, s: visitState(v, day === 'today' ? now : 0) }));
    const by = new Map<string, typeof list>();
    for (const r of list) {
      const k = r.v.flat.communityName;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visits.data, now, day]);

  const all = rows.flatMap(([, l]) => l);
  const tally = (s: VisitState) => all.filter((r) => r.s === s).length;
  const unassignedWeek = counts.get('/allocation/visits') ?? 0;

  if (!me.hasAnyAccess) {
    return (
      <EmptyState title="No modules have been assigned to you yet" icon={ShieldCheck}>
        Your account is active, but nothing has been granted yet. Ask your Super Admin for the modules you need.
      </EmptyState>
    );
  }

  const greeting = (() => {
    const h = istHours(now);
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const dateLabel = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T06:00:00+05:30`),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting}, {me.fullName.split(' ')[0]}
          </h1>
          <p className="page-desc">{dateLabel}</p>
        </div>
        <div className="page-actions">
          {canVisits ? (
            <Segmented
              label="Run sheet day"
              value={day}
              onChange={setDay}
              items={[
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
              ]}
            />
          ) : null}
          {canVisits && unassignedWeek > 0 ? (
            <ButtonLink to="/allocation/visits" variant="primary" icon={Shuffle}>
              Assign visits ({unassignedWeek})
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {canVisits ? (
        <Facts
          items={[
            { label: day === 'today' ? 'Visits today' : 'Visits tomorrow', value: all.length, note: day === 'today' ? `${tally('done')} done · ${tally('progress')} in progress` : `${all.length - tally('unassigned')} assigned` },
            ...(day === 'today'
              ? [
                  { label: 'Late', value: tally('late'), note: `More than ${LATE_GRACE_MIN} min past start`, tone: tally('late') ? ('amber' as const) : undefined },
                  { label: 'No-shows', value: tally('noshow'), note: 'Recorded today', tone: tally('noshow') ? ('red' as const) : undefined },
                ]
              : []),
            { label: 'Unassigned', value: tally('unassigned'), note: `${unassignedWeek} in the next 7 days`, tone: tally('unassigned') ? ('amber' as const) : undefined, to: '/allocation/visits' },
            ...(counts.has('/residents/verifications')
              ? [{ label: 'Verifications', value: counts.get('/residents/verifications') ?? 0, note: 'Waiting for review', to: '/residents/verifications' }]
              : []),
          ]}
        />
      ) : null}

      <div className="home-grid">
        <div className="stack" style={{ minWidth: 0 }}>
          {canVisits ? <RunSheet rows={rows} loading={visits.isLoading} error={visits.error} now={day === 'today' ? now : null} /> : null}
          <Charts dashboard={dashboard.data} loading={dashboard.isLoading} />
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          {canVisits && day === 'today' ? <Alerts rows={all} /> : null}
          <Queues dashboard={dashboard.data} loading={dashboard.isLoading} error={dashboard.error} />
        </div>
      </div>
    </>
  );
}

const STATE_ORDER: VisitState[] = ['late', 'noshow', 'unassigned', 'progress', 'upcoming', 'done', 'exception'];
const STATE_TONE: Record<VisitState, string> = {
  done: 'success',
  progress: 'teal',
  upcoming: 'neutral',
  late: 'warning',
  noshow: 'error',
  unassigned: 'warning',
  exception: 'violet',
};
const ATTENTION: VisitState[] = ['late', 'noshow', 'unassigned', 'exception'];
const hourLabel = (h: number) => (h === 0 ? '12 am' : h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`);

/**
 * The run sheet: the day's visits read top to bottom by hour, like a housekeeping
 * sheet. Each row says when, what, where, who and its state; a gold "Now" marker
 * sits at the current time; status chips filter, each with its count.
 */
function RunSheet({
  rows,
  loading,
  error,
  now,
}: {
  rows: [string, { v: Visit; s: VisitState }[]][];
  loading: boolean;
  error: unknown;
  now: number | null;
}) {
  const [filter, setFilter] = useState<VisitState | 'all' | 'attention'>('all');
  const [community, setCommunity] = useState('');
  const all = rows.flatMap(([, l]) => l);
  const scoped = community ? all.filter((r) => r.v.flat.communityName === community) : all;
  const count = (s: VisitState) => scoped.filter((r) => r.s === s).length;
  const attention = scoped.filter((r) => ATTENTION.includes(r.s)).length;
  const shown = scoped
    .filter((r) => (filter === 'all' ? true : filter === 'attention' ? ATTENTION.includes(r.s) : r.s === filter))
    .sort((a, b) => a.v.startsAt.localeCompare(b.v.startsAt));

  const byHour = new Map<number, typeof shown>();
  for (const r of shown) {
    const h = Math.floor(istHours(r.v.startsAt));
    byHour.set(h, [...(byHour.get(h) ?? []), r]);
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  const nowH = now ? istHours(now) : null;
  const nowSlot = nowH === null ? null : (hours.find((h) => h > nowH) ?? Infinity);

  const total = scoped.length;
  const chips: { key: VisitState | 'all' | 'attention'; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: total },
    { key: 'attention', label: 'Needs attention', n: attention },
    ...STATE_ORDER.filter((s) => s !== 'exception' || count('exception') > 0).map((s) => ({ key: s, label: STATE_LABEL[s], n: count(s) })),
  ];

  const nowMarker = (
    <li className="rs-now" key="now">
      <span className="rs-now-time num">{now ? istTime(now) : ''}</span>
      <span className="rs-now-rule" aria-hidden />
      <span className="rs-now-tag">Now</span>
    </li>
  );

  return (
    <Panel
      title="Run sheet"
      subtitle={
        total
          ? `${count('done')} of ${total} visits done${community ? ` in ${community}` : ` across ${rows.length} ${rows.length === 1 ? 'community' : 'communities'}`}`
          : undefined
      }
      actions={
        <>
          {rows.length > 1 ? (
            <select className="input input-compact" aria-label="Community" value={community} onChange={(e) => setCommunity(e.target.value)}>
              <option value="">All communities</option>
              {rows.map(([c]) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
          <ButtonLink to="/allocation/visits" variant="ghost" size="sm">
            All visits
            <ChevronRight size={14} />
          </ButtonLink>
        </>
      }
      flush
    >
      {error ? (
        <div className="panel-body">
          <ErrorBanner error={error} />
        </div>
      ) : loading ? (
        <div className="panel-body stack-sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={36} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="panel-body">
          <EmptyState title="No visits on this day" icon={CalendarClock}>
            Visits appear here once subscriptions are active and their visits are scheduled.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="rs-head">
            <div className="rs-progress" role="img" aria-label={STATE_ORDER.map((s) => `${STATE_LABEL[s]} ${count(s)}`).join(', ')}>
              {STATE_ORDER.map((s) => {
                const n = count(s);
                return n ? <span key={s} className={`rs-seg ${s}`} style={{ flexGrow: n }} /> : null;
              })}
            </div>
            <div className="rs-chips" role="group" aria-label="Filter visits by state">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="rs-chip"
                  aria-pressed={filter === c.key}
                  onClick={() => setFilter(c.key)}
                  disabled={c.n === 0 && c.key !== 'all' && filter !== c.key}
                >
                  {c.key !== 'all' && c.key !== 'attention' ? <span className={`rs-dot ${c.key}`} aria-hidden /> : null}
                  {c.label}
                  <span className="rs-chip-n num">{c.n}</span>
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="panel-body muted" style={{ margin: 0 }}>
              No visits in this state.
            </p>
          ) : (
            <ol className="rs-list">
              {hours.map((h) => (
                <Fragment key={h}>
                  {nowSlot === h ? nowMarker : null}
                  <li className="rs-hour">
                    <span className="rs-hour-label">{hourLabel(h)}</span>
                    <ul className="rs-rows">
                      {byHour.get(h)!.map(({ v, s }) => (
                        <li key={v.id}>
                          <Link to="/allocation/visits" className={`rs-row ${s}`}>
                            <span className="rs-time num">
                              {istTime(v.startsAt)}
                              <span>{Math.round((new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime()) / 60000)} min</span>
                            </span>
                            <span className="rs-what">
                              <strong>
                                {v.serviceName} · {v.flat.towerName} {v.flat.flatNumber}
                              </strong>
                              <span>
                                {v.flat.communityName} · {v.residentName}
                              </span>
                            </span>
                            <span className={`rs-who ${v.assignment ? '' : 'none'}`}>{v.assignment ? v.assignment.employeeName : 'No worker'}</span>
                            <span className="rs-state">
                              <StatusBadge status={STATE_LABEL[s]} tone={STATE_TONE[s]} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                </Fragment>
              ))}
              {nowSlot === Infinity ? nowMarker : null}
            </ol>
          )}
        </>
      )}
    </Panel>
  );
}

function Alerts({ rows }: { rows: { v: Visit; s: VisitState }[] }) {
  const items = rows
    .filter((r) => r.s === 'late' || r.s === 'noshow' || r.s === 'unassigned' || r.s === 'exception')
    .sort((a, b) => a.v.startsAt.localeCompare(b.v.startsAt))
    .slice(0, 6);
  const icon: Record<string, { I: LucideIcon; c: string }> = {
    late: { I: Clock, c: 'amber' },
    noshow: { I: UserX, c: 'red' },
    unassigned: { I: Shuffle, c: 'amber' },
    exception: { I: CircleAlert, c: 'blue' },
  };
  return (
    <Panel title="Alerts" subtitle={items.length ? 'Visits that need someone now' : undefined} flush>
      {items.length === 0 ? (
        <p className="panel-body muted" style={{ margin: 0 }}>
          Every visit today is on track.
        </p>
      ) : (
        <ul className="alerts">
          {items.map(({ v, s }) => {
            const { I, c } = icon[s] ?? { I: CircleAlert, c: 'blue' };
            return (
              <li key={v.id} className="alert-item">
                <span className={`alert-icon ${c}`} aria-hidden>
                  <I size={16} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="alert-title">
                    {STATE_LABEL[s]} · {v.serviceName}
                  </p>
                  <p className="alert-meta">
                    {v.flat.communityName} · {v.flat.towerName} {v.flat.flatNumber} · {istTime(v.startsAt)}
                    {v.assignment ? ` · ${v.assignment.employeeName}` : ''}
                  </p>
                  <ButtonLink to="/allocation/visits" size="sm" variant={s === 'unassigned' || s === 'noshow' ? 'primary' : 'secondary'}>
                    {s === 'unassigned' ? 'Assign worker' : s === 'noshow' ? 'Find cover' : 'Open visit'}
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const QUEUE_ICON: Record<string, LucideIcon> = {
  residence_verifications: ShieldCheck,
  family_requests: ShieldCheck,
  change_requests: ShieldCheck,
  import_batches: FileSpreadsheet,
  tickets_open: LifeBuoy,
  tickets_overdue: LifeBuoy,
  tickets_escalated: LifeBuoy,
  visits_unassigned: Shuffle,
  payments_review: IndianRupee,
  payment_exceptions: IndianRupee,
  leave_requests: CalendarClock,
  attendance_flags: Clock,
  attendance_corrections: Clock,
  payroll_approval: IndianRupee,
};
const QUEUE_TONE: Record<string, 'amber' | 'red'> = {
  tickets_overdue: 'red',
  tickets_escalated: 'red',
  payment_exceptions: 'red',
  visits_unassigned: 'amber',
  payments_review: 'amber',
};

function Queues({ dashboard, loading, error }: { dashboard: AdminDashboard | undefined; loading: boolean; error: unknown }) {
  const items = (dashboard?.sections.queues?.data?.items ?? []).slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return (
    <Panel title="Needs you" subtitle="Queues within your clusters" flush>
      {error ? (
        <div className="panel-body">
          <ErrorBanner error={error} />
        </div>
      ) : loading ? (
        <div className="panel-body stack-sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={22} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="panel-body muted" style={{ margin: 0 }}>
          No queues for your modules.
        </p>
      ) : (
        <ul className="queue-list">
          {items.map((q) => {
            const I = QUEUE_ICON[q.key] ?? ChevronRight;
            const n = q.count ?? 0;
            const to = q.key === 'import_batches' ? '/locations/migration' : q.to;
            return (
              <li key={q.key}>
                <Link to={to} className="queue-row">
                  <I size={16} />
                  <span className="q-label">{q.label}</span>
                  {q.status === 'unavailable' ? (
                    <span className="faint" title="Could not load right now">
                      —
                    </span>
                  ) : (
                    <span className={`q-count ${n === 0 ? 'zero' : (QUEUE_TONE[q.key] ?? '')}`}>{n}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Charts ---------- */

const C = {
  teal: '#00796b',
  tealSoft: '#9fd1c9',
  red: '#c2410c',
  grid: '#e7eeeb',
  axis: '#6b7a76',
};
const shortDate = (d: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${d}T00:00:00`));
const compactInr = (paise: number) => {
  const r = paise / 100;
  return r >= 100000 ? `₹${(r / 100000).toFixed(1)}L` : r >= 1000 ? `₹${Math.round(r / 1000)}k` : `₹${r}`;
};

function ChartTip({ active, payload, label, money }: TooltipContentProps<number, string> & { money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{shortDate(String(label))}</strong>
      {payload.map((p) => (
        <div key={String(p.dataKey)}>
          <span className="k" style={{ background: p.color }} />
          {p.name}: {money ? formatPaise(Number(p.value)) : p.value}
        </div>
      ))}
    </div>
  );
}

function Charts({ dashboard, loading }: { dashboard: AdminDashboard | undefined; loading: boolean }) {
  const s = dashboard?.sections;
  const visits = s?.visitsDaily?.data?.points ?? [];
  const pays = s?.paymentsDaily?.data?.points ?? [];
  const subs = s?.activeSubscriptionsByService?.data?.items ?? [];
  const workers = s?.workersByReadiness?.data?.items ?? [];
  const tickets = s?.ticketsByCategory?.data?.items ?? [];
  const anyChart = s?.visitsDaily || s?.paymentsDaily || s?.activeSubscriptionsByService || s?.workersByReadiness || s?.ticketsByCategory;
  if (loading)
    return (
      <div className="chart-grid">
        <Skeleton height={300} />
        <Skeleton height={300} />
      </div>
    );
  if (!anyChart) return null;

  const done30 = visits.reduce((n, p) => n + p.completed, 0);
  const sched30 = visits.reduce((n, p) => n + p.scheduled, 0);
  const noShow30 = visits.reduce((n, p) => n + p.noShow, 0);
  const paid30 = pays.reduce((n, p) => n + p.capturedPaise, 0);
  const subMax = Math.max(1, ...subs.map((x) => x.count));
  const ticketMax = Math.max(1, ...tickets.map((x) => x.open));
  const ready = workers.find((w) => w.readiness === 'READY')?.count ?? 0;
  const notReady = workers.find((w) => w.readiness === 'NOT_READY')?.count ?? 0;

  return (
    <div className="chart-grid">
      {s?.visitsDaily ? (
        <Panel title="Visits, last 30 days" subtitle="Completed and no-shows by day" flush>
          <div className="chart-summary">
            <div>
              <span>Completed</span>
              <strong>{done30.toLocaleString('en-IN')}</strong>
            </div>
            <div>
              <span>Completion rate</span>
              <strong>{sched30 ? `${((done30 / sched30) * 100).toFixed(1)}%` : '—'}</strong>
            </div>
            <div>
              <span>No-shows</span>
              <strong style={{ color: noShow30 ? 'var(--red)' : undefined }}>{noShow30}</strong>
            </div>
          </div>
          <div className="chart-box" role="img" aria-label={`Visits over the last 30 days: ${done30} completed of ${sched30} scheduled, ${noShow30} no-shows.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visits} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={34} />
                <Tooltip cursor={{ fill: 'rgb(0 121 107 / 0.06)' }} content={(p) => <ChartTip {...(p as TooltipContentProps<number, string>)} />} />
                <Bar dataKey="completed" name="Completed" stackId="v" fill={C.teal} radius={[0, 0, 0, 0]} animationDuration={700} />
                <Bar dataKey="noShow" name="No-show" stackId="v" fill={C.red} radius={[3, 3, 0, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}
      {s?.paymentsDaily ? (
        <Panel title="Collections, last 30 days" subtitle="Payments captured per day" flush>
          <div className="chart-summary">
            <div>
              <span>Collected</span>
              <strong>{formatPaise(paid30)}</strong>
            </div>
            <div>
              <span>Payments</span>
              <strong>{pays.reduce((n, p) => n + p.count, 0)}</strong>
            </div>
            <div>
              <span>Daily average</span>
              <strong>{formatPaise(Math.round(paid30 / Math.max(1, pays.length)))}</strong>
            </div>
          </div>
          <div className="chart-box" role="img" aria-label={`Collections over the last 30 days: ${formatPaise(paid30)} in total.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pays} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tickFormatter={compactInr} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={48} />
                <Tooltip cursor={{ stroke: C.tealSoft }} content={(p) => <ChartTip {...(p as TooltipContentProps<number, string>)} money />} />
                <Line type="monotone" dataKey="capturedPaise" name="Collected" stroke={C.teal} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} animationDuration={900} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}
      {s?.activeSubscriptionsByService ? (
        <Panel title="Active subscriptions" subtitle="By service" flush>
          {subs.length === 0 ? (
            <p className="panel-body muted" style={{ margin: 0 }}>
              No active subscriptions yet.
            </p>
          ) : (
            <ul className="bar-list">
              {subs.map((x) => (
                <li key={x.serviceId}>
                  <span>{x.serviceName}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ display: 'block', width: `${(x.count / subMax) * 100}%` }} />
                  </span>
                  <strong className="num" style={{ textAlign: 'right' }}>
                    {x.count}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
      {s?.ticketsByCategory || s?.workersByReadiness ? (
        <Panel title={s?.ticketsByCategory ? 'Open tickets by category' : 'Workforce readiness'} flush>
          {s?.workersByReadiness ? (
            <div className="chart-summary" style={{ paddingBottom: 4 }}>
              <div>
                <span>Workers ready</span>
                <strong>{ready}</strong>
              </div>
              <div>
                <span>Not ready</span>
                <strong style={{ color: notReady ? 'var(--amber)' : undefined }}>{notReady}</strong>
              </div>
            </div>
          ) : null}
          {s?.ticketsByCategory ? (
            tickets.length === 0 ? (
              <p className="panel-body muted" style={{ margin: 0 }}>
                No tickets in the last 30 days.
              </p>
            ) : (
              <ul className="bar-list">
                {tickets.slice(0, 6).map((x) => (
                  <li key={x.categoryId}>
                    <span>{x.categoryName}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ display: 'block', width: `${(x.open / ticketMax) * 100}%`, background: '#4d8f86' }} />
                    </span>
                    <strong className="num" style={{ textAlign: 'right' }}>
                      {x.open}
                    </strong>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

export function NoAccessPage() {
  return (
    <EmptyState title="You don’t have access to this page" icon={ShieldCheck}>
      Ask your Super Admin if you need this module. <Link to="/">Go to Home</Link>
    </EmptyState>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState title="Page not found">
      <Link to="/">Go to Home</Link>
    </EmptyState>
  );
}
