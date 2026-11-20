'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Compensation, FinanceSummary, PayrollLine, PayrollRunDetail, PayrollRunSummary } from '@nestovin/contracts';
import { api, apiDownload, ApiError, formatRupees, rupeesToPaise } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useNavigate, useParams } from '../../lib/router';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../../components/ui';
import { Pill } from '../demand/shared';

const FLAG: Record<string, string> = {
  NO_SALARY_SET: 'No salary set',
  PRORATED: 'Part month',
  WORKER_NO_SHOWS_NO_RULE: 'Worker no-shows (no deduction rule yet)',
  LEAVE_NO_RULE: 'Approved leave (no deduction rule yet)',
  PENDING_CORRECTIONS: 'Attendance corrections pending',
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
const RUN_LABEL: Record<string, string> = { DRAFT: 'Draft', IN_REVIEW: 'In review', APPROVED: 'Approved', RETURNED: 'Returned' };
const PAY_LABEL: Record<string, string> = { PENDING: 'Not paid', PARTIALLY_PAID: 'Partly paid', PAID: 'Paid', NOT_PAYABLE: 'Nothing payable' };

/** ADM-14 finance overview. */
export function FinancePage() {
  const summary = useQuery({ queryKey: ['finance-summary'], queryFn: () => api<FinanceSummary>('/v1/admin/finance/summary') });
  return (
    <>
      <PageHeader title="Finance overview" description="Money collected through verified payments, refunds processed and salaries recorded, by month. Nestovin does not replace your accounting software." />
      <DataTable
        caption="Monthly finance summary"
        loading={summary.isLoading}
        error={summary.error}
        rows={summary.data?.months}
        rowKey={(m) => m.month}
        columns={[
          { header: 'Month', cell: (m) => m.month },
          { header: 'Collected', className: 'num', cell: (m) => formatRupees(m.collectedPaise) },
          { header: 'Refunded', className: 'num', cell: (m) => formatRupees(m.refundedPaise) },
          { header: 'Salaries recorded', className: 'num', cell: (m) => formatRupees(m.salaryPaidPaise) },
          { header: 'Bookings confirmed', className: 'num', cell: (m) => m.bookingsConfirmed },
        ]}
      />
    </>
  );
}

/** ADM-14 payroll runs (one common monthly cycle). */
export function PayrollRunsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const runs = useQuery({ queryKey: ['payroll-runs'], queryFn: () => api<{ items: PayrollRunSummary[] }>('/v1/admin/payroll-runs') });
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const create = useMutation({
    mutationFn: () => api<PayrollRunDetail>('/v1/admin/payroll-runs', { method: 'POST', body: { month } }),
    onSuccess: (r) => navigate(`/finance/payroll/${r.id}`),
  });
  return (
    <>
      <PageHeader title="Payroll" description="Monthly payroll for all employees: fixed monthly salary, prorated by calendar days. Anything without an approved rule is flagged for you, never guessed." />
      {can(me, 'finance_payroll', 'create') ? (
        <div className="row">
          <TextInput label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button busy={create.isPending} onClick={() => create.mutate()}>Prepare payroll</Button>
        </div>
      ) : null}
      <ErrorBanner error={create.error} />
      <DataTable
        caption="Payroll runs"
        loading={runs.isLoading}
        error={runs.error}
        rows={runs.data?.items}
        rowKey={(r) => r.id}
        emptyTitle="No payroll prepared yet"
        columns={[
          { header: 'Month', cell: (r) => <Link to={`/finance/payroll/${r.id}`}><strong>{r.month}</strong></Link> },
          { header: 'Version', className: 'num', cell: (r) => r.version },
          { header: 'Status', cell: (r) => <><Pill status={r.status === 'APPROVED' ? 'ACTIVE' : r.status === 'RETURNED' ? 'CANCELLED' : 'AWAITING_PAYMENT'} label={RUN_LABEL[r.status]} />{r.returnReason ? <div className="muted">{r.returnReason}</div> : null}</> },
          { header: 'Employees', className: 'num', cell: (r) => <>{r.employees}{r.flagged ? <div className="muted">{r.flagged} flagged</div> : null}</> },
          { header: 'Net payable', className: 'num', cell: (r) => formatRupees(r.netPaise) },
          { header: 'Recorded as paid', className: 'num', cell: (r) => formatRupees(r.paidPaise) },
          { header: 'Prepared', cell: (r) => formatDateTime(r.preparedAt) },
        ]}
      />
    </>
  );
}

export function PayrollRunPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const key = ['payroll-run', id];
  const run = useQuery({ queryKey: key, queryFn: () => api<PayrollRunDetail>(`/v1/admin/payroll-runs/${id}`) });
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [entryFor, setEntryFor] = useState<PayrollLine | null>(null);
  const [payFor, setPayFor] = useState<PayrollLine | null>(null);
  const [error, setError] = useState<unknown>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ['payroll-runs'] });
  };
  const act = useMutation({
    mutationFn: (path: 'submit' | 'approve') => api(`/v1/admin/payroll-runs/${id}/${path}`, { method: 'POST' }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: refresh,
  });
  const ret = useMutation({
    mutationFn: () => api(`/v1/admin/payroll-runs/${id}/return`, { method: 'POST', body: { reason } }),
    onSuccess: async () => {
      setReturning(false);
      await refresh();
    },
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api(`/v1/admin/payroll-items/${itemId}`, { method: 'DELETE' }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: refresh,
  });
  const reverse = useMutation({
    mutationFn: (v: { paymentId: string; reason: string }) => api(`/v1/admin/salary-payments/${v.paymentId}/reverse`, { method: 'POST', body: { reason: v.reason } }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: refresh,
  });

  if (run.isLoading) return <Spinner />;
  if (run.error || !run.data) return <ErrorBanner error={run.error ?? new Error('Payroll run not found')} />;
  const r = run.data;
  const draft = r.status === 'DRAFT';
  return (
    <>
      <p className="breadcrumb">
        <Link to="/finance/payroll">Payroll</Link> / {r.month} v{r.version}
      </p>
      <PageHeader
        title={`Payroll ${r.month}`}
        description={`Version ${r.version} · ${RUN_LABEL[r.status]} · ${r.employees} employees · net ${formatRupees(r.netPaise)} · recorded as paid ${formatRupees(r.paidPaise)}`}
        actions={
          <div className="row">
            {can(me, 'finance_payroll', 'export') ? <Button variant="ghost" onClick={() => void apiDownload(`/v1/admin/payroll-runs/${id}/export`, `payroll-${r.month}.csv`)}>Export CSV</Button> : null}
            {draft && can(me, 'finance_payroll', 'edit') ? <Button busy={act.isPending} onClick={() => act.mutate('submit')}>Send for review</Button> : null}
            {r.status === 'IN_REVIEW' && can(me, 'finance_payroll', 'approve') ? (
              <>
                <Button variant="secondary" onClick={() => setReturning(true)}>Return</Button>
                <Button busy={act.isPending} onClick={() => act.mutate('approve')}>Approve</Button>
              </>
            ) : null}
          </div>
        }
      />
      <ErrorBanner error={error} />
      {r.status === 'APPROVED' ? <InfoBanner>Approved. Make the transfers through your bank, then record each actual payment here. Approval does not mark anyone as paid.</InfoBanner> : null}
      {r.status === 'RETURNED' ? <InfoBanner tone="warning">Returned: {r.returnReason}. Prepare the month again to create the next version; this version stays in the history.</InfoBanner> : null}
      {r.flagged ? <InfoBanner tone="warning">{r.flagged} employee(s) are flagged. Review the flags and add authorised entries where needed before sending for review.</InfoBanner> : null}
      <DataTable
        caption="Payroll lines"
        rows={r.lines}
        rowKey={(l) => l.id}
        emptyTitle="No employees in this month"
        columns={[
          { header: 'Employee', cell: (l) => <><strong>{l.employee.fullName}</strong><div className="muted">{l.employee.employeeCode}</div></> },
          {
            header: 'Basis',
            cell: (l) => (
              <>
                {l.payableDays}/{l.daysInMonth} days
                {l.compensation.map((c) => <div key={c.from} className="muted">{formatRupees(c.monthlyAmountPaise)}/month · {c.days} d</div>)}
                <div className="muted">{l.attendance.completedVisits} visits completed</div>
              </>
            ),
          },
          {
            header: 'Entries',
            cell: (l) => (
              <>
                {l.items.map((i) => (
                  <div key={i.id}>
                    {i.kind === 'DEDUCTION' ? '− ' : ''}{COMPONENT[i.component] ?? i.component} {formatRupees(i.amountPaise)}
                    {i.note ? <span className="muted"> ({i.note})</span> : null}
                    {draft && i.sourceType === 'AUTHORISED_ENTRY' && can(me, 'finance_payroll', 'edit') ? <Button variant="ghost" onClick={() => removeItem.mutate(i.id)}>Remove</Button> : null}
                  </div>
                ))}
                {draft && can(me, 'finance_payroll', 'edit') ? <Button variant="ghost" onClick={() => setEntryFor(l)}>Add entry</Button> : null}
              </>
            ),
          },
          { header: 'Net', className: 'num', cell: (l) => <strong>{formatRupees(l.netPaise)}</strong> },
          { header: 'Flags', cell: (l) => l.flags.map((f) => <div key={f}><span className="badge badge-warning">{FLAG[f] ?? f}</span></div>) },
          {
            header: 'Payment',
            cell: (l) => (
              <>
                <Pill status={l.paymentStatus === 'PAID' ? 'ACTIVE' : l.paymentStatus === 'NOT_PAYABLE' ? 'DRAFT' : 'AWAITING_PAYMENT'} label={PAY_LABEL[l.paymentStatus]} />
                {l.payments.map((p) => (
                  <div key={p.id} className="muted">
                    {formatRupees(p.amountPaise)} · {p.paidOn} · {p.method.replace('_', ' ').toLowerCase()} {p.reference ?? ''}
                    {p.reversesPaymentId ? ' (reversal)' : null}
                    {!p.reversesPaymentId && !l.payments.some((x) => x.reversesPaymentId === p.id) && can(me, 'finance_payroll', 'record_payment') ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const why = window.prompt('Why is this payment being reversed?');
                          if (why && why.trim().length >= 3) reverse.mutate({ paymentId: p.id, reason: why.trim() });
                        }}
                      >
                        Reverse
                      </Button>
                    ) : null}
                  </div>
                ))}
                {r.status === 'APPROVED' && l.paidPaise < l.netPaise && can(me, 'finance_payroll', 'record_payment') ? <Button variant="secondary" onClick={() => setPayFor(l)}>Record payment</Button> : null}
              </>
            ),
          },
        ]}
      />
      {returning ? (
        <Modal
          open
          title="Return for correction"
          onClose={() => setReturning(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setReturning(false)}>Cancel</Button>
              <Button variant="danger" disabled={reason.trim().length < 3} busy={ret.isPending} onClick={() => ret.mutate()}>Return</Button>
            </>
          }
        >
          <TextArea label="What needs correcting" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorBanner error={ret.error} />
        </Modal>
      ) : null}
      {entryFor ? <EntryDialog line={entryFor} onClose={() => setEntryFor(null)} onDone={refresh} /> : null}
      {payFor ? <PaymentDialog line={payFor} onClose={() => setPayFor(null)} onDone={refresh} /> : null}
    </>
  );
}

function EntryDialog({ line, onClose, onDone }: { line: PayrollLine; onClose: () => void; onDone: () => Promise<void> }) {
  const [component, setComponent] = useState('ALLOWANCE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const deduction = component === 'ABSENCE_DEDUCTION' || component === 'OTHER_DEDUCTION';
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/payroll-lines/${line.id}/items`, { method: 'POST', body: { kind: deduction ? 'DEDUCTION' : 'EARNING', component, amountPaise: rupeesToPaise(amount), note } }),
    onSuccess: async () => {
      await onDone();
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={`Authorised entry – ${line.employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!rupeesToPaise(amount) || note.trim().length < 3} busy={save.isPending} onClick={() => save.mutate()}>Add</Button>
        </>
      }
    >
      <InfoBanner>Use this for approved allowances, overtime or deductions. Every entry needs a reason and is kept in the payroll history.</InfoBanner>
      <SelectInput label="Type" value={component} onChange={(e) => setComponent(e.target.value)} options={Object.entries(COMPONENT).filter(([k]) => k !== 'BASE_SALARY').map(([value, label]) => ({ value, label }))} />
      <TextInput label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={err?.field('amountPaise')} />
      <TextArea label="Reason / approval reference" required value={note} onChange={(e) => setNote(e.target.value)} error={err?.field('note')} />
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}

function PaymentDialog({ line, onClose, onDone }: { line: PayrollLine; onClose: () => void; onDone: () => Promise<void> }) {
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
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={`Record payment – ${line.employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!rupeesToPaise(amount)} busy={save.isPending} onClick={() => save.mutate()}>Record</Button>
        </>
      }
    >
      <InfoBanner>Record only a transfer that has actually been made. A matching salary expense is created automatically.</InfoBanner>
      <TextInput label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Outstanding ${formatRupees(outstanding)}`} error={err?.field('amountPaise')} />
      <TextInput label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      <SelectInput label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'UPI', label: 'UPI' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'CASH', label: 'Cash' }]} />
      <TextInput label="Bank / UPI reference" value={reference} onChange={(e) => setReference(e.target.value)} error={err?.field('reference')} hint="Duplicate references are refused." />
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}

/** Salary panel on the employee page (finance_payroll). */
export function CompensationPanel({ employeeId }: { employeeId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const key = ['compensation', employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => api<{ items: Compensation[] }>(`/v1/admin/employees/${employeeId}/compensation`) });
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/employees/${employeeId}/compensation`, { method: 'POST', body: { monthlyAmountPaise: rupeesToPaise(amount), effectiveFrom: from } }),
    onSuccess: async () => {
      setAmount('');
      await qc.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <div className="card stack">
      <h2 className="section-title">Salary</h2>
      <p className="muted">Fixed monthly salary; part months are prorated by calendar days.</p>
      {list.isLoading ? <Spinner /> : null}
      {(list.data?.items ?? []).map((c) => (
        <p key={c.id}>{formatRupees(c.monthlyAmountPaise)}/month · from {c.effectiveFrom}{c.effectiveTo ? ` to ${c.effectiveTo}` : ''}</p>
      ))}
      {list.data?.items.length === 0 ? <p className="muted">No salary set.</p> : null}
      {can(me, 'finance_payroll', 'edit') ? (
        <div className="row">
          <TextInput label="Monthly salary (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Button disabled={!rupeesToPaise(amount)} busy={save.isPending} onClick={() => save.mutate()}>Set salary</Button>
        </div>
      ) : null}
      <ErrorBanner error={save.error} />
    </div>
  );
}
