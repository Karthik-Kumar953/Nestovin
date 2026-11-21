'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { Compensation, FinanceSummary, PayrollLine, PayrollRunDetail, PayrollRunSummary } from '@nestovin/contracts';
import { api, apiDownload, ApiError, formatRupees, rupeesToPaise } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { useNavigate, useParams } from '../../lib/router';
import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Facts,
  formatDate,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Segmented,
  SelectInput,
  Skeleton,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../components/ui';
import { ChartColumn, Download, Plus, Send, ShieldCheck, Undo2, Wallet } from '../../components/icons';
import { monthLabel, StageIndicator } from '../demand/shared';
import { RecordHistory } from '../../components/RecordHistory';

const FLAG: Record<string, string> = {
  NO_SALARY_SET: 'No salary set',
  PRORATED: 'Part month',
  WORKER_NO_SHOWS_NO_RULE: 'Worker no-shows (no deduction rule yet)',
  LEAVE_NO_RULE: 'Approved leave (no deduction rule yet)',
  PENDING_CORRECTIONS: 'Attendance corrections pending',
  OVERTIME_NO_RATE: 'Confirmed overtime (add an authorised entry; no rate yet)',
};
const COMPONENT: Record<string, string> = {
  BASE_SALARY: 'Base salary',
  ALLOWANCE: 'Allowance',
  INCENTIVE: 'Incentive',
  APPROVED_OVERTIME: 'Approved overtime',
  ABSENCE_DEDUCTION: 'Absence deduction',
  OTHER_DEDUCTION: 'Other deduction',
  OTHER_EARNING: 'Other earning',
};
const METHOD: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CHEQUE: 'Cheque', CASH: 'Cash' };
const PAY_LABEL: Record<string, string> = { PENDING: 'Not paid', PARTIALLY_PAID: 'Partly paid', PAID: 'Paid', NOT_PAYABLE: 'Nothing payable' };
const PAY_TONE: Record<string, string> = { PENDING: 'warning', PARTIALLY_PAID: 'warning', PAID: 'success', NOT_PAYABLE: 'neutral' };

function PayBadge({ status }: { status: string }) {
  return <span className={`badge badge-${PAY_TONE[status] ?? 'neutral'}`}>{PAY_LABEL[status] ?? status}</span>;
}
const subLine = (text: string) => (
  <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
    {text}
  </span>
);

/* ---------- Finance overview (revenue) ---------- */

type Month = FinanceSummary['months'][number];
const compactInr = (paise: number) => {
  const r = Math.abs(paise) / 100;
  const s = r >= 100000 ? `₹${(r / 100000).toFixed(1)}L` : r >= 1000 ? `₹${Math.round(r / 1000)}k` : `₹${Math.round(r)}`;
  return paise < 0 ? `−${s}` : s;
};

function RevenueTip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const m = payload[0]!.payload as Month;
  return (
    <div className="chart-tooltip">
      <strong>{monthLabel(m.month, 'long')}</strong>
      <div>
        <span className="k" style={{ background: 'var(--teal)' }} />
        Collected: {formatRupees(m.collectedPaise)}
      </div>
      <div>
        <span className="k" style={{ background: 'var(--red)' }} />
        Refunded: {formatRupees(m.refundedPaise)}
      </div>
      <div>Net collected: {formatRupees(m.collectedPaise - m.refundedPaise)}</div>
      <div>
        <span className="k" style={{ background: 'var(--ink-2)' }} />
        Salaries recorded: {formatRupees(m.salaryPaidPaise)}
      </div>
      <div>Bookings confirmed: {m.bookingsConfirmed}</div>
    </div>
  );
}

/** ADM-14 finance overview. */
export function FinancePage() {
  const summary = useQuery({ queryKey: ['finance-summary'], queryFn: () => api<FinanceSummary>('/v1/admin/finance/summary') });
  const [range, setRange] = useState<'6' | '12' | 'all'>('12');
  const sorted = useMemo(() => [...(summary.data?.months ?? [])].sort((a, b) => a.month.localeCompare(b.month)), [summary.data]);
  const shown = range === 'all' ? sorted : sorted.slice(-Number(range));
  const total = (k: keyof Omit<Month, 'month'>) => shown.reduce((n, m) => n + m[k], 0);
  const collected = total('collectedPaise');
  const refunded = total('refundedPaise');
  const salaries = total('salaryPaidPaise');
  const rangeLabel = range === 'all' ? 'all months' : `last ${range} months`;

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Money collected through verified payments, refunds processed and salaries recorded, by month. Nestovin does not replace your accounting software."
        actions={
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            items={[
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      <ErrorBanner error={summary.error} />
      {summary.isLoading ? (
        <div className="stack">
          <Skeleton height={64} />
          <Skeleton height={300} />
        </div>
      ) : summary.data && shown.length === 0 ? (
        <Panel>
          <EmptyState title="No money recorded yet" icon={ChartColumn}>
            Verified payments, refunds and recorded salary payments appear here by month.
          </EmptyState>
        </Panel>
      ) : summary.data ? (
        <div className="stack">
          <Facts
            items={[
              { label: 'Collected', value: formatRupees(collected), note: rangeLabel },
              { label: 'Refunded', value: formatRupees(refunded), tone: refunded ? 'red' : undefined },
              { label: 'Net collected', value: formatRupees(collected - refunded) },
              { label: 'Salaries recorded', value: formatRupees(salaries), note: collected - refunded ? `${Math.round((salaries / Math.max(1, collected - refunded)) * 100)}% of net collected` : undefined },
              { label: 'Bookings confirmed', value: total('bookingsConfirmed') },
            ]}
          />
          <Panel title="Collections and salaries" subtitle={`By month, ${rangeLabel}. Hover a month for exact amounts.`} flush>
            <div className="row" style={{ padding: '12px 18px 0', gap: 16, fontSize: 12.5 }} aria-hidden>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: 'var(--teal)' }} />
                Collected
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: 'var(--ink-2)' }} />
                Salaries recorded
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: 'var(--red)', height: 2 }} />
                Refunded
              </span>
            </div>
            <div
              className="chart-box"
              style={{ height: 280 }}
              role="img"
              aria-label={`Collections and salaries, ${rangeLabel}: ${formatRupees(collected)} collected, ${formatRupees(refunded)} refunded, ${formatRupees(salaries)} salaries recorded. Exact figures are in the table below.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={shown} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={3}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m)} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tickFormatter={compactInr} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip cursor={{ fill: 'var(--teal-tint)', fillOpacity: 0.5 }} content={(p) => <RevenueTip {...(p as TooltipContentProps<number, string>)} />} />
                  <Bar dataKey="collectedPaise" name="Collected" fill="var(--teal)" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={700} />
                  <Bar dataKey="salaryPaidPaise" name="Salaries recorded" fill="var(--ink-2)" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={700} />
                  <Line type="monotone" dataKey="refundedPaise" name="Refunded" stroke="var(--red)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} animationDuration={900} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Monthly summary" flush>
            <DataTable
              flush
              caption="Monthly finance summary"
              rows={[...shown].reverse()}
              rowKey={(m) => m.month}
              columns={[
                { header: 'Month', cell: (m) => <span className="primary-cell">{monthLabel(m.month, 'long')}</span> },
                { header: 'Collected', className: 'num', cell: (m) => formatRupees(m.collectedPaise) },
                { header: 'Refunded', className: 'num', cell: (m) => (m.refundedPaise ? formatRupees(m.refundedPaise) : <span className="muted">{formatRupees(0)}</span>) },
                { header: 'Net collected', className: 'num', cell: (m) => <strong>{formatRupees(m.collectedPaise - m.refundedPaise)}</strong> },
                { header: 'Salaries recorded', className: 'num', cell: (m) => formatRupees(m.salaryPaidPaise) },
                { header: 'Bookings confirmed', className: 'num', cell: (m) => m.bookingsConfirmed },
              ]}
            />
          </Panel>
        </div>
      ) : null}
    </>
  );
}

/* ---------- Payroll runs ---------- */

/** ADM-14 payroll runs (one common monthly cycle). */
export function PayrollRunsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const runs = useQuery({ queryKey: ['payroll-runs'], queryFn: () => api<{ items: PayrollRunSummary[] }>('/v1/admin/payroll-runs') });
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const create = useMutation({
    mutationFn: () => api<PayrollRunDetail>('/v1/admin/payroll-runs', { method: 'POST', body: { month } }),
    onSuccess: (r) => {
      toast(`Payroll for ${monthLabel(r.month, 'long')} prepared`);
      navigate(`/finance/payroll/${r.id}`);
    },
  });
  const items = runs.data?.items ?? [];
  const inReview = items.filter((r) => r.status === 'IN_REVIEW').length;
  const awaitingPay = items.filter((r) => r.status === 'APPROVED' && r.paidPaise < r.netPaise);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly payroll for all employees: fixed monthly salary, prorated by calendar days. Anything without an approved rule is flagged for you, never guessed."
        actions={
          can(me, 'finance_payroll', 'create') ? (
            <div className="row">
              <input className="input input-compact" type="month" aria-label="Payroll month" value={month} onChange={(e) => setMonth(e.target.value)} />
              <Button icon={Plus} busy={create.isPending} disabled={!month} onClick={() => create.mutate()}>
                Prepare payroll
              </Button>
            </div>
          ) : null
        }
      />
      <div className="stack">
        <ErrorBanner error={create.error} />
        {items.length ? (
          <Facts
            items={[
              { label: 'In review', value: inReview, tone: inReview ? 'amber' : undefined, note: inReview ? 'Waiting for a second admin' : undefined },
              {
                label: 'Approved, not fully paid',
                value: awaitingPay.length,
                note: awaitingPay.length ? `${formatRupees(awaitingPay.reduce((n, r) => n + r.netPaise - r.paidPaise, 0))} outstanding` : undefined,
              },
            ]}
          />
        ) : null}
        <Panel flush>
          <DataTable
            flush
            caption="Payroll runs"
            loading={runs.isLoading}
            error={runs.error}
            rows={runs.data?.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/finance/payroll/${r.id}`)}
            emptyTitle="No payroll prepared yet"
            emptyBody={can(me, 'finance_payroll', 'create') ? 'Choose a month above and prepare its payroll. It starts as a draft you can review.' : undefined}
            columns={[
              {
                header: 'Month',
                cell: (r) => (
                  <span className="primary-cell">
                    {monthLabel(r.month, 'long')}
                    <span className="sub">Version {r.version}</span>
                  </span>
                ),
              },
              {
                header: 'Status',
                cell: (r) => (
                  <>
                    <StatusBadge status={r.status} />
                    {r.returnReason && r.status === 'RETURNED' ? subLine(r.returnReason) : null}
                  </>
                ),
              },
              { header: 'Employees', className: 'num', cell: (r) => <>{r.employees}{r.flagged ? subLine(`${r.flagged} flagged`) : null}</> },
              { header: 'Net payable', className: 'num', cell: (r) => formatRupees(r.netPaise) },
              { header: 'Recorded as paid', className: 'num', cell: (r) => formatRupees(r.paidPaise) },
              { header: 'Prepared', cell: (r) => <>{formatDate(r.preparedAt)}{subLine(r.preparedBy === me.id ? 'By you' : 'By another admin')}</> },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

const RUN_STAGES = [
  { key: 'DRAFT', label: 'Draft', note: 'Prepared' },
  { key: 'IN_REVIEW', label: 'In review', note: 'Second admin checks' },
  { key: 'APPROVED', label: 'Approved', note: 'Record transfers' },
];

export function PayrollRunPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const key = ['payroll-run', id];
  const run = useQuery({ queryKey: key, queryFn: () => api<PayrollRunDetail>(`/v1/admin/payroll-runs/${id}`) });
  const [entryFor, setEntryFor] = useState<PayrollLine | null>(null);
  const [payFor, setPayFor] = useState<PayrollLine | null>(null);
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sodBlocked, setSodBlocked] = useState(false);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ['payroll-runs'] });
  };
  const act = useMutation({
    mutationFn: (path: 'submit' | 'approve') => api(`/v1/admin/payroll-runs/${id}/${path}`, { method: 'POST' }),
    onMutate: () => setError(null),
    onError: (e, path) => {
      if (path === 'approve' && e instanceof ApiError && e.code === 'SAME_PREPARER_APPROVER') {
        setSodBlocked(true);
        toast('Another admin must approve this payroll', 'error');
        return;
      }
      setError(e);
    },
    onSuccess: async (_d, path) => {
      await refresh();
      toast(path === 'submit' ? 'Payroll sent for review' : 'Payroll approved');
    },
  });
  const ret = useMutation({
    mutationFn: (reason: string) => api(`/v1/admin/payroll-runs/${id}/return`, { method: 'POST', body: { reason } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: async () => {
      await refresh();
      toast('Payroll returned for correction');
    },
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api(`/v1/admin/payroll-items/${itemId}`, { method: 'DELETE' }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: async () => {
      await refresh();
      toast('Entry removed');
    },
  });
  const reverse = useMutation({
    mutationFn: (v: { paymentId: string; reason: string }) => api(`/v1/admin/salary-payments/${v.paymentId}/reverse`, { method: 'POST', body: { reason: v.reason } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: async () => {
      await refresh();
      toast('Payment reversed');
    },
  });

  if (run.isLoading) return <Spinner />;
  if (run.error || !run.data) return <ErrorBanner error={run.error ?? new Error('Payroll run not found')} />;
  const r = run.data;
  const draft = r.status === 'DRAFT';
  const canEdit = can(me, 'finance_payroll', 'edit');
  const canPay = can(me, 'finance_payroll', 'record_payment');
  const iPrepared = r.preparedBy === me.id;
  const iSubmitted = r.submittedBy === me.id;
  const cannotApprove = iPrepared || iSubmitted || sodBlocked;
  const sodReason = iPrepared
    ? 'You prepared this payroll, so another admin must approve it.'
    : iSubmitted
      ? 'You sent this payroll for review, so another admin must approve it.'
      : 'You prepared or submitted this payroll, so another admin with approval rights must approve it.';
  const who = (adminId: string | null | undefined) => (!adminId ? null : adminId === me.id ? 'You' : 'Another admin');
  const outstanding = r.lines.reduce((n, l) => n + Math.max(0, l.netPaise - l.paidPaise), 0);
  const openLine = r.lines.find((l) => l.id === openLineId) ?? null;
  const title = monthLabel(r.month, 'long');

  const onSubmit = async () => {
    const c = await confirm({
      title: 'Send this payroll for review?',
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {r.employees} employees, net {formatRupees(r.netPaise)}. Entries can’t be changed while it is in review.
          </p>
          {r.flagged ? (
            <p style={{ margin: 0 }}>
              <strong>{r.flagged} employee(s) are still flagged.</strong> Make sure each flag has been looked at.
            </p>
          ) : null}
          <p style={{ margin: 0 }}>Another admin with approval rights must approve it; you won’t be able to approve it yourself.</p>
        </div>
      ),
      confirmLabel: 'Send for review',
      tone: r.flagged ? 'warning' : 'default',
    });
    if (c.ok) act.mutate('submit');
  };
  const onApprove = async () => {
    const c = await confirm({
      title: `Approve payroll for ${title}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            Version {r.version}: {r.employees} employees, net payable {formatRupees(r.netPaise)}. Employees with pay due can see their payslip once it is approved.
          </p>
          <p style={{ margin: 0 }}>Approval does not mark anyone as paid. Make the transfers through your bank, then record each one here.</p>
        </div>
      ),
      confirmLabel: 'Approve payroll',
      tone: 'warning',
    });
    if (c.ok) act.mutate('approve');
  };
  const onReturn = async () => {
    const c = await confirm({
      title: 'Return this payroll for correction?',
      body: `Version ${r.version} stays in the history as returned. To correct it, prepare ${title} again, which creates the next version.`,
      confirmLabel: 'Return payroll',
      tone: 'danger',
      reason: { label: 'What needs correcting', required: true, minLength: 3 },
    });
    if (c.ok) ret.mutate(c.reason);
  };
  const onRemoveItem = async (line: PayrollLine, item: PayrollLine['items'][number]) => {
    const c = await confirm({
      title: 'Remove this entry?',
      body: `${COMPONENT[item.component] ?? item.component} of ${formatRupees(item.amountPaise)} will be removed from ${line.employee.fullName}’s pay, and their net pay is recalculated.`,
      confirmLabel: 'Remove entry',
      tone: 'danger',
    });
    if (c.ok) removeItem.mutate(item.id);
  };
  const onReverse = async (line: PayrollLine, p: PayrollLine['payments'][number]) => {
    const c = await confirm({
      title: 'Reverse this salary payment?',
      body: `The ${formatRupees(p.amountPaise)} ${METHOD[p.method]?.toLowerCase() ?? p.method} recorded for ${line.employee.fullName} on ${formatDate(p.paidOn)} is reversed by a new entry; the original stays on record. Their outstanding amount goes back up. Use this only if the transfer was not actually made or was recorded wrongly.`,
      confirmLabel: 'Reverse payment',
      tone: 'danger',
      reason: { label: 'Why is this payment being reversed?', required: true, minLength: 3 },
    });
    if (c.ok) reverse.mutate({ paymentId: p.id, reason: c.reason });
  };

  return (
    <>
      <PageHeader
        crumb={{ to: '/finance/payroll', label: 'Payroll' }}
        title={`Payroll ${title}`}
        description={`Version ${r.version} · prepared ${formatDateTime(r.preparedAt)}`}
        actions={
          <>
            {can(me, 'finance_payroll', 'export') ? (
              <Button variant="ghost" icon={Download} onClick={() => void apiDownload(`/v1/admin/payroll-runs/${id}/export`, `payroll-${r.month}.csv`).catch(setError)}>
                Export CSV
              </Button>
            ) : null}
            {draft && canEdit ? (
              <Button icon={Send} busy={act.isPending} onClick={() => void onSubmit()}>
                Send for review
              </Button>
            ) : null}
            {r.status === 'IN_REVIEW' && can(me, 'finance_payroll', 'approve') ? (
              <>
                <Button variant="secondary" busy={ret.isPending} onClick={() => void onReturn()}>
                  Return
                </Button>
                <Button icon={ShieldCheck} busy={act.isPending} disabled={cannotApprove} title={cannotApprove ? sodReason : undefined} onClick={() => void onApprove()}>
                  Approve
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="stack">
        <Panel>
          <div className="stack-sm">
            {r.status === 'RETURNED' ? (
              <div className="row">
                <StatusBadge status="RETURNED" />
                <span>
                  Returned{r.reviewedAt ? ` ${formatDateTime(r.reviewedAt)}` : ''}: {r.returnReason}
                </span>
              </div>
            ) : (
              <StageIndicator stages={RUN_STAGES} current={r.status} label="Payroll stage" />
            )}
            <dl className="details" style={{ margin: 0 }}>
              <div>
                <dt>Prepared by</dt>
                <dd>
                  {who(r.preparedBy) ?? <span className="muted">Not recorded</span>} · {formatDate(r.preparedAt)}
                </dd>
              </div>
              <div>
                <dt>Sent for review by</dt>
                <dd>{who(r.submittedBy) ?? <span className="muted">{draft ? 'Not yet' : 'Not recorded'}</span>}</dd>
              </div>
              <div>
                <dt>{r.status === 'RETURNED' ? 'Returned by' : 'Approved by'}</dt>
                <dd>
                  {who(r.reviewedBy) ? (
                    <>
                      {who(r.reviewedBy)}
                      {r.reviewedAt ? ` · ${formatDate(r.reviewedAt)}` : ''}
                    </>
                  ) : (
                    <span className="muted">Not yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </Panel>

        {r.status === 'IN_REVIEW' && can(me, 'finance_payroll', 'approve') && cannotApprove ? (
          <InfoBanner tone="warning">{sodReason} You can still return it for correction.</InfoBanner>
        ) : null}
        {r.status === 'APPROVED' ? (
          <InfoBanner>Approved. Make the transfers through your bank, then record each actual payment here. Approval does not mark anyone as paid.</InfoBanner>
        ) : null}
        {r.status === 'RETURNED' ? (
          <InfoBanner tone="warning">Prepare {title} again to create the next version; this version stays in the history.</InfoBanner>
        ) : null}
        {r.flagged && draft ? (
          <InfoBanner tone="warning">{r.flagged} employee(s) are flagged. Open each one to review the flags and add authorised entries where needed before sending for review.</InfoBanner>
        ) : null}
        <ErrorBanner error={error} />

        <Facts
          items={[
            { label: 'Employees', value: r.employees, note: r.flagged ? `${r.flagged} flagged` : undefined, tone: r.flagged ? 'amber' : undefined },
            { label: 'Net payable', value: formatRupees(r.netPaise) },
            { label: 'Recorded as paid', value: formatRupees(r.paidPaise), icon: Wallet },
            { label: 'Outstanding', value: formatRupees(outstanding), tone: r.status === 'APPROVED' && outstanding ? 'amber' : undefined },
          ]}
        />

        <Panel title="Employees" subtitle="Select an employee to see the basis, entries and payments." flush>
          <DataTable
            flush
            caption="Payroll lines"
            rows={r.lines}
            rowKey={(l) => l.id}
            onRowClick={(l) => setOpenLineId(l.id)}
            emptyTitle="No employees in this month"
            columns={[
              {
                header: 'Employee',
                cell: (l) => (
                  <span className="primary-cell">
                    {l.employee.fullName}
                    <span className="sub">{l.employee.employeeCode}</span>
                  </span>
                ),
              },
              { header: 'Days', className: 'num', cell: (l) => <>{l.payableDays}/{l.daysInMonth}{subLine(`${l.attendance.completedVisits} visits`)}</> },
              {
                header: 'Net',
                className: 'num',
                cell: (l) => (
                  <>
                    <strong>{formatRupees(l.netPaise)}</strong>
                    {l.deductionsPaise ? subLine(`− ${formatRupees(l.deductionsPaise)} deductions`) : null}
                  </>
                ),
              },
              {
                header: 'Flags',
                cell: (l) =>
                  l.flags.length ? (
                    <span className="badge badge-warning" title={l.flags.map((f) => FLAG[f] ?? f).join('; ')}>
                      {l.flags.length === 1 ? (FLAG[l.flags[0]!] ?? l.flags[0]) : `${l.flags.length} flags`}
                    </span>
                  ) : (
                    <span className="muted">None</span>
                  ),
              },
              {
                header: 'Payment',
                cell: (l) => (
                  <>
                    <PayBadge status={l.paymentStatus} />
                    {l.paidPaise ? subLine(`${formatRupees(l.paidPaise)} paid`) : null}
                  </>
                ),
              },
              {
                header: 'Actions',
                className: 'actions',
                cell: (l) => (
                  <div className="row">
                    {draft && canEdit ? (
                      <Button size="sm" variant="ghost" icon={Plus} onClick={() => setEntryFor(l)}>
                        Entry
                      </Button>
                    ) : null}
                    {r.status === 'APPROVED' && l.paidPaise < l.netPaise && canPay ? (
                      <Button size="sm" variant="secondary" icon={Wallet} onClick={() => setPayFor(l)}>
                        Record payment
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Panel>
        <RecordHistory targetType="payroll_run" targetId={r.id} />
      </div>

      <Drawer
        open={Boolean(openLine)}
        onClose={() => setOpenLineId(null)}
        title={openLine?.employee.fullName ?? 'Employee'}
        subtitle={openLine ? `${openLine.employee.employeeCode} · ${title}` : undefined}
        footer={
          openLine ? (
            <>
              {draft && canEdit ? (
                <Button variant="secondary" icon={Plus} onClick={() => setEntryFor(openLine)}>
                  Add entry
                </Button>
              ) : null}
              {r.status === 'APPROVED' && openLine.paidPaise < openLine.netPaise && canPay ? (
                <Button icon={Wallet} onClick={() => setPayFor(openLine)}>
                  Record payment
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {openLine ? (
          <div className="stack">
            {openLine.flags.length ? (
              <InfoBanner tone="warning">
                {openLine.flags.map((f) => (
                  <span key={f} style={{ display: 'block' }}>
                    {FLAG[f] ?? f}
                  </span>
                ))}
              </InfoBanner>
            ) : null}
            <dl className="kv">
              <dt>Payable days</dt>
              <dd>
                {openLine.payableDays} of {openLine.daysInMonth}
              </dd>
              <dt>Salary basis</dt>
              <dd>
                {openLine.compensation.length ? (
                  openLine.compensation.map((c) => (
                    <span key={c.from} style={{ display: 'block' }}>
                      {formatRupees(c.monthlyAmountPaise)}/month · {c.days} days ({formatDate(c.from)} to {formatDate(c.to)})
                    </span>
                  ))
                ) : (
                  <span className="muted">No salary set</span>
                )}
              </dd>
              <dt>Attendance</dt>
              <dd>
                {openLine.attendance.completedVisits} visits completed
                {subLine(
                  [
                    `${openLine.attendance.workerNoShows} worker no-shows`,
                    `${openLine.attendance.residentNoShows} resident no-shows`,
                    `${openLine.attendance.approvedLeaveDays} leave days`,
                    openLine.attendance.pendingCorrections ? `${openLine.attendance.pendingCorrections} corrections pending` : null,
                    openLine.attendance.overtimeVisits ? `${openLine.attendance.overtimeVisits} overtime visits` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )}
              </dd>
            </dl>

            <h3 className="section-title" style={{ margin: 0 }}>
              Entries
            </h3>
            <DataTable
              caption="Payroll entries"
              rows={openLine.items}
              rowKey={(i) => i.id}
              emptyTitle="No entries"
              columns={[
                { header: 'Entry', cell: (i) => <span className="primary-cell">{COMPONENT[i.component] ?? i.component}{i.note ? <span className="sub">{i.note}</span> : null}</span> },
                {
                  header: 'Amount',
                  className: 'num',
                  cell: (i) => (
                    <span style={{ color: i.kind === 'DEDUCTION' ? 'var(--red)' : undefined }}>
                      {i.kind === 'DEDUCTION' ? '− ' : ''}
                      {formatRupees(i.amountPaise)}
                    </span>
                  ),
                },
                {
                  header: 'Actions',
                  className: 'actions',
                  cell: (i) =>
                    draft && i.sourceType === 'AUTHORISED_ENTRY' && canEdit ? (
                      <div className="row">
                        <Button
                          size="sm"
                          variant="ghost"
                          busy={removeItem.isPending && removeItem.variables === i.id}
                          onClick={() => void onRemoveItem(openLine, i)}
                          aria-label={`Remove ${COMPONENT[i.component] ?? i.component} ${formatRupees(i.amountPaise)}`}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
            <dl className="kv">
              <dt>Earnings</dt>
              <dd>{formatRupees(openLine.earningsPaise)}</dd>
              <dt>Deductions</dt>
              <dd>{formatRupees(openLine.deductionsPaise)}</dd>
              <dt>Net</dt>
              <dd>
                <strong>{formatRupees(openLine.netPaise)}</strong>
              </dd>
            </dl>

            <div className="row-between">
              <h3 className="section-title" style={{ margin: 0 }}>
                Payments
              </h3>
              <PayBadge status={openLine.paymentStatus} />
            </div>
            {openLine.payments.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {r.status === 'APPROVED' ? 'No payment recorded yet.' : 'Payments can be recorded once the payroll is approved.'}
              </p>
            ) : (
              <DataTable
                caption="Salary payments"
                rows={openLine.payments}
                rowKey={(p) => p.id}
                columns={[
                  {
                    header: 'Payment',
                    cell: (p) => (
                      <span className="primary-cell">
                        {formatDate(p.paidOn)}
                        <span className="sub">
                          {METHOD[p.method] ?? p.method}
                          {p.reference ? ` · ${p.reference}` : ''}
                          {p.reversesPaymentId ? ' · reversal' : ''}
                        </span>
                      </span>
                    ),
                  },
                  { header: 'Amount', className: 'num', cell: (p) => formatRupees(p.amountPaise) },
                  {
                    header: 'Actions',
                    className: 'actions',
                    cell: (p) =>
                      !p.reversesPaymentId && !openLine.payments.some((x) => x.reversesPaymentId === p.id) && canPay ? (
                        <div className="row">
                          <Button size="sm" variant="ghost" icon={Undo2} busy={reverse.isPending && reverse.variables?.paymentId === p.id} onClick={() => void onReverse(openLine, p)}>
                            Reverse
                          </Button>
                        </div>
                      ) : openLine.payments.some((x) => x.reversesPaymentId === p.id) ? (
                        <span className="muted">Reversed</span>
                      ) : null,
                  },
                ]}
              />
            )}
            <p className="muted" style={{ margin: 0 }}>
              {formatRupees(openLine.paidPaise)} recorded as paid of {formatRupees(openLine.netPaise)}.
            </p>
          </div>
        ) : null}
      </Drawer>

      {entryFor ? <EntryDialog line={entryFor} onClose={() => setEntryFor(null)} onDone={refresh} /> : null}
      {payFor ? <PaymentDialog line={payFor} onClose={() => setPayFor(null)} onDone={refresh} /> : null}
    </>
  );
}

function EntryDialog({ line, onClose, onDone }: { line: PayrollLine; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [component, setComponent] = useState('ALLOWANCE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const deduction = component === 'ABSENCE_DEDUCTION' || component === 'OTHER_DEDUCTION';
  const save = useMutation({
    mutationFn: () =>
      api(`/v1/admin/payroll-lines/${line.id}/items`, { method: 'POST', body: { kind: deduction ? 'DEDUCTION' : 'EARNING', component, amountPaise: rupeesToPaise(amount), note } }),
    onSuccess: async () => {
      await onDone();
      toast(`${deduction ? 'Deduction' : 'Earning'} added for ${line.employee.fullName}`);
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const paise = rupeesToPaise(amount);
  return (
    <Modal
      open
      title={`Authorised entry – ${line.employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!paise || note.trim().length < 3} busy={save.isPending} onClick={() => save.mutate()}>
            Add {deduction ? 'deduction' : 'earning'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <InfoBanner>Use this for approved allowances, overtime or deductions. Every entry needs a reason and is kept in the payroll history.</InfoBanner>
        <SelectInput
          label="Type"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
          options={Object.entries(COMPONENT)
            .filter(([k]) => k !== 'BASE_SALARY')
            .map(([value, label]) => ({ value, label }))}
        />
        <TextInput
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={err?.field('amountPaise') ?? (Number.isNaN(paise) ? 'Enter an amount like 1500 or 1500.50' : undefined)}
          hint={deduction ? 'Taken off the net pay.' : 'Added to the net pay.'}
        />
        <TextArea label="Reason / approval reference" required value={note} onChange={(e) => setNote(e.target.value)} error={err?.field('note')} />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

function PaymentDialog({ line, onClose, onDone }: { line: PayrollLine; onClose: () => void; onDone: () => Promise<void> }) {
  const confirm = useConfirm();
  const toast = useToast();
  const outstanding = line.netPaise - line.paidPaise;
  const [amount, setAmount] = useState(String(outstanding / 100));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api(`/v1/admin/payroll-lines/${line.id}/payments`, { method: 'POST', body: { amountPaise: rupeesToPaise(amount), paidOn, method, reference: reference.trim() || undefined } }),
    onSuccess: async () => {
      await onDone();
      toast(`Payment recorded for ${line.employee.fullName}`);
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const paise = rupeesToPaise(amount);
  const submit = async () => {
    const c = await confirm({
      title: 'Record this salary payment?',
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {formatRupees(paise ?? 0)} paid to {line.employee.fullName} on {formatDate(paidOn)} by {METHOD[method]?.toLowerCase() ?? method}
            {reference.trim() ? ` (reference ${reference.trim()})` : ''}.
          </p>
          {paise !== null && paise > outstanding ? (
            <p style={{ margin: 0 }}>
              <strong>This is more than the {formatRupees(outstanding)} outstanding.</strong>
            </p>
          ) : null}
          <p style={{ margin: 0 }}>Record only a transfer that has actually been made. A matching salary expense is created automatically.</p>
        </div>
      ),
      confirmLabel: 'Record payment',
      tone: 'warning',
    });
    if (c.ok) save.mutate();
  };
  return (
    <Modal
      open
      title={`Record payment – ${line.employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!paise || !paidOn} busy={save.isPending} onClick={() => void submit()}>
            Record
          </Button>
        </>
      }
    >
      <div className="stack">
        <InfoBanner>Record only a transfer that has actually been made. A matching salary expense is created automatically.</InfoBanner>
        <TextInput
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Outstanding ${formatRupees(outstanding)}`}
          error={err?.field('amountPaise') ?? (Number.isNaN(paise) ? 'Enter an amount like 1500 or 1500.50' : undefined)}
        />
        <div className="grid-2">
          <TextInput label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={err?.field('paidOn')} />
          <SelectInput label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={Object.entries(METHOD).map(([value, label]) => ({ value, label }))} />
        </div>
        <TextInput label="Bank / UPI reference" value={reference} onChange={(e) => setReference(e.target.value)} error={err?.field('reference')} hint="Duplicate references are refused." />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

/** Salary panel on the employee page (finance_payroll). */
export function CompensationPanel({ employeeId }: { employeeId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const key = ['compensation', employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => api<{ items: Compensation[] }>(`/v1/admin/employees/${employeeId}/compensation`) });
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/employees/${employeeId}/compensation`, { method: 'POST', body: { monthlyAmountPaise: rupeesToPaise(amount), effectiveFrom: from } }),
    onSuccess: async () => {
      setAmount('');
      await qc.invalidateQueries({ queryKey: key });
      toast('Salary set');
    },
  });
  const paise = rupeesToPaise(amount);
  const submit = async () => {
    const c = await confirm({
      title: 'Set this salary?',
      body: `${formatRupees(paise ?? 0)} per month from ${formatDate(from)}. Payroll prepared for months from that date uses this amount, prorated by calendar days.`,
      confirmLabel: 'Set salary',
      tone: 'warning',
    });
    if (c.ok) save.mutate();
  };
  return (
    <Panel title="Salary" subtitle="Fixed monthly salary; part months are prorated by calendar days.">
      <div className="stack">
        {list.isLoading ? <Skeleton height={40} /> : null}
        <ErrorBanner error={list.error} />
        {list.data?.items.length === 0 ? <p className="muted" style={{ margin: 0 }}>No salary set. Payroll flags this employee until one is set.</p> : null}
        {list.data?.items.length ? (
          <dl className="kv">
            {list.data.items.map((c) => (
              <div key={c.id} style={{ display: 'contents' }}>
                <dt>
                  {formatDate(c.effectiveFrom)}
                  {c.effectiveTo ? ` to ${formatDate(c.effectiveTo)}` : ' onwards'}
                </dt>
                <dd>{formatRupees(c.monthlyAmountPaise)}/month</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {can(me, 'finance_payroll', 'edit') ? (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <TextInput
              label="Monthly salary (₹)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={Number.isNaN(paise) ? 'Enter an amount like 15000' : undefined}
            />
            <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Button disabled={!paise || !from} busy={save.isPending} onClick={() => void submit()}>
              Set salary
            </Button>
          </div>
        ) : null}
        <ErrorBanner error={save.error} />
      </div>
    </Panel>
  );
}
