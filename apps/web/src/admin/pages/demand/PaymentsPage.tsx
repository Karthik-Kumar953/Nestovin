'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBooking, AdminPayment, PaymentException } from '@nestovin/contracts';
import { api, ApiError, formatRupees, qs, rupeesToPaise } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, TextArea, TextInput, Toolbar } from '../../components/ui';
import { BOOKING_STATUS_LABEL, CommunityPicker, daysLabel, Pill, useSelectedCommunity } from './shared';

const PURPOSE: Record<string, string> = { INITIAL: 'Initial (demand)', BALANCE: 'Remaining balance', FULL: 'Full payment' };
const REASON: Record<string, string> = {
  AMOUNT_MISMATCH: 'Amount did not match',
  CURRENCY_MISMATCH: 'Currency did not match',
  SLOT_UNAVAILABLE: 'Slot full when paid',
  CYCLE_CLOSED: 'Paid after the cycle closed',
  DEADLINE_PASSED: 'Paid after the balance deadline',
  DUPLICATE_PAYMENT: 'Duplicate payment',
  RECORD_NOT_PAYABLE: 'Record no longer payable',
  UNAPPROVED_REFUND: 'Refund without approval',
  UNKNOWN_ORDER: 'Unknown order',
};

/** ADM-08 bookings: status of bookings and subscriptions, with manual reminders. */
export function BookingsPage() {
  const me = useMe();
  const [communityId, setCommunityId, communities] = useSelectedCommunity();
  const [status, setStatus] = useState('');
  const list = usePagedList<AdminBooking>(['admin-bookings'], `/v1/admin/bookings${qs({ communityId, status, limit: 50 })}`, Boolean(communityId));
  const [notice, setNotice] = useState<string | null>(null);
  const remind = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/bookings/${id}/remind`, { method: 'POST' }),
    onMutate: () => setNotice(null),
    onSuccess: () => setNotice('Reminder queued. It does not change the payment state.'),
  });
  return (
    <>
      <PageHeader title="Bookings" description="Bookings, their payment state and the subscription period, kept separate." />
      <Toolbar>
        <ExportButton path={`/v1/admin/exports/bookings${communityId ? `?communityId=${communityId}` : ''}`} module="demand_payments" fileName="bookings.csv" />
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <select className="input input-compact" aria-label="Booking status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(BOOKING_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Toolbar>
      {notice ? <InfoBanner tone="success">{notice}</InfoBanner> : null}
      <ErrorBanner error={remind.error} />
      <DataTable
        caption="Bookings"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(b) => b.id}
        emptyTitle="No bookings"
        columns={[
          { header: 'Household', cell: (b) => <><strong>{b.resident.fullName ?? b.resident.phone}</strong><div className="muted">{b.flat.towerName} · {b.flat.flatNumber}</div></> },
          { header: 'Plan', cell: (b) => <>{b.planName}<div className="muted">{b.selectionLabel} · {b.mode === 'DEMAND_LED' ? 'Demand-led' : 'Continuous'}</div></> },
          { header: 'Slot', cell: (b) => <>{b.slot.label}<div className="muted">{b.slot.startTime} · {daysLabel(b.slot.daysOfWeek)}</div></> },
          {
            header: 'Payment',
            className: 'num',
            cell: (b) => (
              <>
                {formatRupees(b.paidPaise)} <span className="muted">of {formatRupees(b.totalPaise)}</span>
                {b.balanceDueAt ? <div className="muted">Due {formatDateTime(b.balanceDueAt)}</div> : null}
              </>
            ),
          },
          { header: 'Booking', cell: (b) => <Pill status={b.status} label={BOOKING_STATUS_LABEL[b.status]} /> },
          {
            header: 'Subscription',
            cell: (b) => (b.subscription ? <><Pill status={b.subscription.status} /><div className="muted">{b.subscription.periodStart} → {b.subscription.periodEnd}</div></> : <span className="muted">—</span>),
          },
          {
            header: 'Actions',
            className: 'actions',
            cell: (b) =>
              b.status === 'PENDING_PAYMENT' && can(me, 'demand_payments', 'edit') ? (
                <Button variant="secondary" busy={remind.isPending && remind.variables === b.id} onClick={() => remind.mutate(b.id)}>
                  Send reminder
                </Button>
              ) : null,
          },
        ]}
        footer={list.hasMore ? <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>Load more</Button> : null}
      />
    </>
  );
}

/** ADM-08 payments: backend-verified payment records, exceptions and refund approvals (ADR-013). */
export function PaymentsPage() {
  const me = useMe();
  const [tab, setTab] = useState<'payments' | 'exceptions'>('exceptions');
  const [status, setStatus] = useState('');
  const list = usePagedList<AdminPayment>(['admin-payments'], `/v1/admin/payments${qs({ status, limit: 50 })}`, tab === 'payments');
  const [exStatus, setExStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const exceptions = useQuery({
    queryKey: ['payment-exceptions', exStatus],
    queryFn: () => api<{ items: PaymentException[] }>(`/v1/admin/payment-exceptions?status=${exStatus}`),
    enabled: tab === 'exceptions',
  });
  const [refundFor, setRefundFor] = useState<{ transactionId: string; maxPaise: number } | null>(null);
  const [resolving, setResolving] = useState<PaymentException | null>(null);

  return (
    <>
      <PageHeader title="Payments" description="Only payments verified by the server are shown as paid. Refunds are approved here and issued in the Razorpay dashboard." />
      <div className="row" role="tablist">
        <Button variant={tab === 'exceptions' ? 'primary' : 'secondary'} onClick={() => setTab('exceptions')}>Needs review</Button>
        <Button variant={tab === 'payments' ? 'primary' : 'secondary'} onClick={() => setTab('payments')}>All payments</Button>
      </div>
      {tab === 'exceptions' ? (
        <>
          <Toolbar>
            <select className="input input-compact" aria-label="Exception status" value={exStatus} onChange={(e) => setExStatus(e.target.value as 'OPEN' | 'RESOLVED')}>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </Toolbar>
          <DataTable
            caption="Payment exceptions"
            loading={exceptions.isLoading}
            error={exceptions.error}
            rows={exceptions.data?.items}
            rowKey={(e) => e.id}
            emptyTitle={exStatus === 'OPEN' ? 'Nothing needs review' : 'No resolved exceptions'}
            columns={[
              { header: 'Issue', cell: (e) => <><strong>{REASON[e.reasonCode] ?? e.reasonCode}</strong><div className="muted">{e.detail}</div></> },
              { header: 'Resident', cell: (e) => (e.resident ? <>{e.resident.fullName ?? e.resident.phone}<div className="muted">{e.resident.phone}</div></> : '—') },
              { header: 'Amount', className: 'num', cell: (e) => (e.amountPaise === null ? '—' : formatRupees(e.amountPaise)) },
              { header: 'Raised', cell: (e) => formatDateTime(e.createdAt) },
              {
                header: exStatus === 'OPEN' ? 'Actions' : 'Resolution',
                className: 'actions',
                cell: (e) =>
                  e.status === 'OPEN' ? (
                    <div className="row">
                      {e.transactionId && e.amountPaise && can(me, 'demand_payments', 'approve') && e.reasonCode !== 'UNAPPROVED_REFUND' ? (
                        <Button variant="secondary" onClick={() => setRefundFor({ transactionId: e.transactionId!, maxPaise: e.amountPaise! })}>Approve refund</Button>
                      ) : null}
                      {can(me, 'demand_payments', 'edit') ? <Button variant="ghost" onClick={() => setResolving(e)}>Resolve</Button> : null}
                    </div>
                  ) : (
                    <span className="muted">{e.resolutionNote}</span>
                  ),
              },
            ]}
          />
        </>
      ) : (
        <>
          <Toolbar>
            <ExportButton path="/v1/admin/exports/payments" module="demand_payments" fileName="payments.csv" />
            <select className="input input-compact" aria-label="Payment status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PAID">Paid</option>
              <option value="CREATED">Started, not paid</option>
              <option value="REVIEW_REQUIRED">Needs review</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </Toolbar>
          <DataTable
            caption="Payments"
            loading={list.isLoading}
            error={list.error}
            rows={list.rows}
            rowKey={(p) => p.id}
            emptyTitle="No payments"
            columns={[
              { header: 'Resident', cell: (p) => <>{p.resident.fullName ?? p.resident.phone}<div className="muted">{p.reference}</div></> },
              { header: 'Purpose', cell: (p) => PURPOSE[p.purpose] },
              { header: 'Amount', className: 'num', cell: (p) => formatRupees(p.amountPaise) },
              {
                header: 'Verified payment',
                cell: (p) =>
                  p.transaction ? (
                    <>
                      {p.transaction.providerPaymentId}
                      <div className="muted">
                        {p.transaction.method ?? ''} · {formatDateTime(p.transaction.verifiedAt)}
                        {p.transaction.refundedPaise ? ` · refunded ${formatRupees(p.transaction.refundedPaise)}` : ''}
                      </div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              { header: 'Status', cell: (p) => <Pill status={p.status} /> },
              {
                header: 'Actions',
                className: 'actions',
                cell: (p) =>
                  p.transaction && can(me, 'demand_payments', 'approve') && p.transaction.refundedPaise < p.transaction.amountPaise ? (
                    <Button variant="ghost" onClick={() => setRefundFor({ transactionId: p.transaction!.id, maxPaise: p.transaction!.amountPaise - p.transaction!.refundedPaise })}>
                      Approve refund
                    </Button>
                  ) : null,
              },
            ]}
            footer={list.hasMore ? <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>Load more</Button> : null}
          />
        </>
      )}
      {refundFor ? <RefundDialog {...refundFor} onClose={() => setRefundFor(null)} /> : null}
      {resolving ? <ResolveDialog exception={resolving} onClose={() => setResolving(null)} /> : null}
    </>
  );
}

function RefundDialog({ transactionId, maxPaise, onClose }: { transactionId: string; maxPaise: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(maxPaise / 100));
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api<{ providerPaymentId: string }>(`/v1/admin/payment-transactions/${transactionId}/refunds`, { method: 'POST', body: { amountPaise: rupeesToPaise(amount), reason } }),
    onSuccess: async (r) => {
      setDone(r.providerPaymentId);
      await qc.invalidateQueries({ queryKey: ['admin-payments'] });
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title="Approve refund"
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button busy={save.isPending} disabled={reason.trim().length < 3 || !rupeesToPaise(amount)} onClick={() => save.mutate()}>Approve</Button>
          </>
        )
      }
    >
      {done ? (
        <InfoBanner tone="success">
          Approved. Issue the refund for payment <strong>{done}</strong> in the Razorpay dashboard; it is recorded here automatically when Razorpay confirms it.
        </InfoBanner>
      ) : (
        <>
          <InfoBanner>Approving records your decision. The money is returned only when the refund is issued in Razorpay.</InfoBanner>
          <TextInput label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={err?.field('amountPaise')} hint={`Up to ${formatRupees(maxPaise)}`} />
          <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
          <ErrorBanner error={err?.fields.length ? null : save.error} />
        </>
      )}
    </Modal>
  );
}

function ResolveDialog({ exception, onClose }: { exception: PaymentException; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/payment-exceptions/${exception.id}/resolve`, { method: 'POST', body: { note } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['payment-exceptions'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Resolve exception"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} disabled={note.trim().length < 3} onClick={() => save.mutate()}>Resolve</Button>
        </>
      }
    >
      <p>{REASON[exception.reasonCode] ?? exception.reasonCode}: {exception.detail}</p>
      <TextArea label="What was done" required value={note} onChange={(e) => setNote(e.target.value)} hint="e.g. “Refunded in full”, “Resident contacted, booked another slot”." />
      <ErrorBanner error={save.error} />
    </Modal>
  );
}
