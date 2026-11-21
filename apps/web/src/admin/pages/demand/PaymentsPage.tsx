'use client';

import { useState, type ReactNode } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBooking, AdminPayment, PaymentException } from '@nestovin/contracts';
import { api, ApiError, formatRupees, qs, rupeesToPaise } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  Drawer,
  ErrorBanner,
  FilterSelect,
  formatDate,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Segmented,
  Tabs,
  TextArea,
  TextInput,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import { BellRing, CircleCheck, Undo2 } from '../../components/icons';
import { BOOKING_STATUS_LABEL, CommunityPicker, CopyId, daysLabel, Pill, useCommunityOptions, useSelectedCommunity } from './shared';

const PURPOSE: Record<string, string> = { INITIAL: 'Initial (demand)', BALANCE: 'Remaining balance', FULL: 'Full payment' };
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAID: 'Paid',
  CREATED: 'Started, not paid',
  FAILED: 'Failed',
  REVIEW_REQUIRED: 'Needs review',
  EXPIRED: 'Expired',
};
const TX_STATUS_LABEL: Record<string, string> = { CAPTURED: 'Captured', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded' };
const SUB_STATUS_LABEL: Record<string, string> = { PENDING_ACTIVATION: 'Starts soon', ACTIVE: 'Active', ENDED: 'Ended', CANCELLED: 'Cancelled' };

/** Exception reasons in plain English: a short label and what actually happened. */
const REASON: Record<string, { label: string; explain: string }> = {
  AMOUNT_MISMATCH: { label: 'Amount did not match', explain: 'The amount Razorpay captured is different from the amount that was due.' },
  CURRENCY_MISMATCH: { label: 'Currency did not match', explain: 'The payment was captured in a currency other than rupees.' },
  SLOT_UNAVAILABLE: { label: 'Slot full when paid', explain: 'The resident paid, but the slot had no places left by the time the payment was verified.' },
  CYCLE_CLOSED: { label: 'Paid after the cycle closed', explain: 'The initial payment arrived after the demand cycle stopped collecting.' },
  DEADLINE_PASSED: { label: 'Paid after the balance deadline', explain: 'The remaining balance arrived after the slot set’s deadline.' },
  DUPLICATE_PAYMENT: { label: 'Duplicate payment', explain: 'A second payment was captured for something that was already paid.' },
  RECORD_NOT_PAYABLE: { label: 'Record no longer payable', explain: 'The booking or request had already expired or been cancelled when the payment arrived.' },
  UNAPPROVED_REFUND: { label: 'Refund without approval', explain: 'Razorpay reported a refund that was not approved in Nestovin first.' },
  UNKNOWN_ORDER: { label: 'Unknown order', explain: 'Razorpay reported a payment for an order Nestovin does not recognise.' },
};
const reasonOf = (code: string) => REASON[code] ?? { label: code.replace(/_/g, ' ').toLowerCase(), explain: 'See the detail recorded with this exception.' };

const sub = (children: ReactNode) => (
  <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
    {children}
  </span>
);

/** ADM-08 bookings: status of bookings and subscriptions, with manual reminders. */
export function BookingsPage() {
  const me = useMe();
  const confirm = useConfirm();
  const toast = useToast();
  const [communityId, setCommunityId, communities] = useSelectedCommunity();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<AdminBooking | null>(null);
  const list = usePagedList<AdminBooking>(['admin-bookings'], `/v1/admin/bookings${qs({ communityId, status, limit: 50 })}`, Boolean(communityId));
  const remind = useMutation({
    mutationFn: (b: AdminBooking) => api(`/v1/admin/bookings/${b.id}/remind`, { method: 'POST' }),
    onSuccess: (_d, b) => toast(`Reminder queued for ${b.resident.fullName ?? b.resident.phone}`),
  });
  const canRemind = can(me, 'demand_payments', 'edit');

  const onRemind = async (b: AdminBooking) => {
    const r = await confirm({
      title: 'Send a payment reminder?',
      body: `${b.resident.fullName ?? b.resident.phone} (${b.flat.towerName} · ${b.flat.flatNumber}) will be reminded to pay ${formatRupees(b.outstandingPaise)} for ${b.planName}${
        b.balanceDueAt ? ` by ${formatDateTime(b.balanceDueAt)}` : ''
      }. The reminder does not change the booking or payment state.`,
      confirmLabel: 'Send reminder',
    });
    if (r.ok) remind.mutate(b);
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Bookings, their payment state and the subscription period, kept separate."
        actions={<ExportButton path={`/v1/admin/exports/bookings${communityId ? `?communityId=${communityId}` : ''}`} module="demand_payments" fileName="bookings.csv" />}
      />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <FilterSelect value={status} onChange={setStatus} label="Booking status" options={Object.entries(BOOKING_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
      </Toolbar>
      <div className="stack">
        <ErrorBanner error={remind.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Bookings"
            loading={list.isLoading}
            error={list.error}
            rows={list.rows}
            rowKey={(b) => b.id}
            onRowClick={setOpen}
            emptyTitle={status ? 'No bookings with this status' : 'No bookings yet'}
            emptyBody={status ? 'Choose another status or clear the filter.' : 'Bookings appear here when residents book a slot in this community.'}
            columns={[
              {
                header: 'Household',
                cell: (b) => (
                  <span className="primary-cell">
                    {b.resident.fullName ?? b.resident.phone}
                    <span className="sub">
                      {b.flat.towerName} · {b.flat.flatNumber}
                    </span>
                  </span>
                ),
              },
              { header: 'Plan', cell: (b) => <>{b.planName}{sub(`${b.selectionLabel} · ${b.mode === 'DEMAND_LED' ? 'Demand-led' : 'Continuous'}`)}</> },
              { header: 'Slot', cell: (b) => <>{b.slot.label}{sub(`${b.slot.startTime} · ${daysLabel(b.slot.daysOfWeek)}`)}</> },
              {
                header: 'Paid',
                className: 'num',
                cell: (b) => (
                  <>
                    {formatRupees(b.paidPaise)}
                    {sub(b.balanceDueAt ? `Due ${formatDateTime(b.balanceDueAt)}` : `of ${formatRupees(b.totalPaise)}`)}
                  </>
                ),
              },
              {
                header: 'Status',
                cell: (b) => (
                  <>
                    <Pill status={b.status} label={BOOKING_STATUS_LABEL[b.status]} />
                    {b.subscription ? sub(`Subscription ${(SUB_STATUS_LABEL[b.subscription.status] ?? b.subscription.status).toLowerCase()}`) : null}
                  </>
                ),
              },
              {
                header: 'Actions',
                className: 'actions',
                cell: (b) =>
                  b.status === 'PENDING_PAYMENT' && canRemind ? (
                    <div className="row">
                      <Button size="sm" variant="secondary" icon={BellRing} busy={remind.isPending && remind.variables?.id === b.id} onClick={() => void onRemind(b)}>
                        Remind
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
            footer={
              list.hasMore ? (
                <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                  Load more
                </Button>
              ) : null
            }
          />
        </Panel>
      </div>
      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? (open.resident.fullName ?? open.resident.phone) : 'Booking'}
        subtitle={open ? `Booking ${open.reference}` : undefined}
        footer={
          open && open.status === 'PENDING_PAYMENT' && canRemind ? (
            <Button variant="secondary" icon={BellRing} busy={remind.isPending} onClick={() => void onRemind(open)}>
              Send reminder
            </Button>
          ) : undefined
        }
      >
        {open ? (
          <div className="stack">
            <dl className="kv">
              <dt>Booking</dt>
              <dd>
                <Pill status={open.status} label={BOOKING_STATUS_LABEL[open.status]} />
              </dd>
              <dt>Household</dt>
              <dd>
                {open.flat.towerName} · {open.flat.flatNumber}
                {sub(`${open.flat.communityName} · ${open.resident.phone}`)}
              </dd>
              <dt>Plan</dt>
              <dd>
                {open.planName}
                {sub(`${open.selectionLabel} · ${open.mode === 'DEMAND_LED' ? 'Demand-led' : 'Continuous'}`)}
              </dd>
              <dt>Slot</dt>
              <dd>
                {open.slot.label}
                {sub(`${open.slot.startTime} · ${open.slot.durationMinutes} min · ${daysLabel(open.slot.daysOfWeek)}`)}
              </dd>
              <dt>Starts</dt>
              <dd>{formatDate(open.startDate)}</dd>
              <dt>Booked on</dt>
              <dd>{formatDateTime(open.createdAt)}</dd>
            </dl>
            <h3 className="section-title" style={{ margin: 0 }}>
              Payment
            </h3>
            <dl className="kv">
              <dt>Total</dt>
              <dd>{formatRupees(open.totalPaise)}</dd>
              <dt>Paid</dt>
              <dd>{formatRupees(open.paidPaise)}</dd>
              <dt>Outstanding</dt>
              <dd>{open.outstandingPaise ? <strong>{formatRupees(open.outstandingPaise)}</strong> : formatRupees(0)}</dd>
              {open.balanceDueAt ? (
                <>
                  <dt>Balance due</dt>
                  <dd>{formatDateTime(open.balanceDueAt)}</dd>
                </>
              ) : null}
            </dl>
            <h3 className="section-title" style={{ margin: 0 }}>
              Subscription
            </h3>
            {open.subscription ? (
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <Pill status={open.subscription.status} label={SUB_STATUS_LABEL[open.subscription.status]} />
                </dd>
                <dt>Period</dt>
                <dd>
                  {formatDate(open.subscription.periodStart)} to {formatDate(open.subscription.periodEnd)}
                </dd>
                <dt>Renewable</dt>
                <dd>{open.subscription.renewable ? 'Yes' : 'No'}</dd>
              </dl>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No subscription for this booking yet.
              </p>
            )}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

type RefundTarget = { transactionId: string; maxPaise: number; providerPaymentId?: string | undefined; who: string };

/** ADM-08 payments: backend-verified payment records, exceptions and refund approvals (ADR-013). */
export function PaymentsPage() {
  const me = useMe();
  const [tab, setTab] = useState<'payments' | 'exceptions'>('exceptions');
  const [status, setStatus] = useState('');
  const [communityId, setCommunityId] = useState('');
  const communityOptions = useCommunityOptions();
  const list = usePagedList<AdminPayment>(['admin-payments'], `/v1/admin/payments${qs({ status, communityId, limit: 50 })}`, tab === 'payments');
  const [exStatus, setExStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const exceptions = useQuery({
    queryKey: ['payment-exceptions', exStatus, communityId],
    queryFn: () => api<{ items: PaymentException[] }>(`/v1/admin/payment-exceptions${qs({ status: exStatus, communityId })}`),
    enabled: tab === 'exceptions',
  });
  const openCount = useQuery({
    queryKey: ['payment-exceptions', 'OPEN'],
    queryFn: () => api<{ items: PaymentException[] }>('/v1/admin/payment-exceptions?status=OPEN'),
  });
  const [refundFor, setRefundFor] = useState<RefundTarget | null>(null);
  const [resolving, setResolving] = useState<PaymentException | null>(null);
  const [payment, setPayment] = useState<AdminPayment | null>(null);
  const [exception, setException] = useState<PaymentException | null>(null);
  const canApprove = can(me, 'demand_payments', 'approve');
  const canEdit = can(me, 'demand_payments', 'edit');

  const exceptionRefund = (e: PaymentException): RefundTarget | null =>
    e.status === 'OPEN' && e.transactionId && e.amountPaise && canApprove && e.reasonCode !== 'UNAPPROVED_REFUND'
      ? { transactionId: e.transactionId, maxPaise: e.amountPaise, who: e.resident?.fullName ?? e.resident?.phone ?? 'this resident' }
      : null;
  const paymentRefund = (p: AdminPayment): RefundTarget | null =>
    p.transaction && canApprove && p.transaction.refundedPaise < p.transaction.amountPaise
      ? {
          transactionId: p.transaction.id,
          maxPaise: p.transaction.amountPaise - p.transaction.refundedPaise,
          providerPaymentId: p.transaction.providerPaymentId,
          who: p.resident.fullName ?? p.resident.phone,
        }
      : null;

  return (
    <>
      <PageHeader title="Payments" description="Only payments verified by the server are shown as paid. Refunds are approved here and issued in the Razorpay dashboard." />
      <Tabs
        label="Payments view"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'exceptions', label: 'Needs review', count: openCount.data?.items.length },
          { value: 'payments', label: 'All payments' },
        ]}
      />
      {tab === 'exceptions' ? (
        <>
          <Toolbar>
            <Segmented
              label="Exception status"
              value={exStatus}
              onChange={setExStatus}
              items={[
                { value: 'OPEN', label: 'Open' },
                { value: 'RESOLVED', label: 'Resolved' },
              ]}
            />
            <FilterSelect value={communityId} onChange={setCommunityId} label="Community" options={(communityOptions.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Toolbar>
          <Panel flush>
            <DataTable
              flush
              caption="Payment exceptions"
              loading={exceptions.isLoading}
              error={exceptions.error}
              rows={exceptions.data?.items}
              rowKey={(e) => e.id}
              onRowClick={setException}
              emptyTitle={exStatus === 'OPEN' ? 'Nothing needs review' : 'No resolved exceptions'}
              emptyBody={exStatus === 'OPEN' ? 'Payments that can’t be matched safely to a booking or request appear here.' : undefined}
              columns={[
                {
                  header: 'Reason',
                  cell: (e) => (
                    <span className="primary-cell">
                      {reasonOf(e.reasonCode).label}
                      <span className="sub">{e.detail ?? reasonOf(e.reasonCode).explain}</span>
                    </span>
                  ),
                },
                { header: 'Resident', cell: (e) => (e.resident ? <>{e.resident.fullName ?? e.resident.phone}{e.resident.fullName ? sub(e.resident.phone) : null}</> : <span className="muted">Unknown</span>) },
                { header: 'Amount', className: 'num', cell: (e) => (e.amountPaise === null ? <span className="muted">—</span> : formatRupees(e.amountPaise)) },
                { header: exStatus === 'OPEN' ? 'Raised' : 'Resolved', cell: (e) => formatDateTime(exStatus === 'OPEN' ? e.createdAt : (e.resolvedAt ?? e.createdAt)) },
                {
                  header: exStatus === 'OPEN' ? 'Actions' : 'Resolution',
                  className: exStatus === 'OPEN' ? 'actions' : undefined,
                  cell: (e) => {
                    if (e.status !== 'OPEN') return <span className="muted">{e.resolutionNote}</span>;
                    const refund = exceptionRefund(e);
                    return (
                      <div className="row">
                        {refund ? (
                          <Button size="sm" variant="secondary" icon={Undo2} onClick={() => setRefundFor(refund)}>
                            Approve refund
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <Button size="sm" variant="ghost" icon={CircleCheck} onClick={() => setResolving(e)}>
                            Resolve
                          </Button>
                        ) : null}
                      </div>
                    );
                  },
                },
              ]}
            />
          </Panel>
        </>
      ) : (
        <>
          <Toolbar>
            <FilterSelect value={communityId} onChange={setCommunityId} label="Community" options={(communityOptions.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect value={status} onChange={setStatus} label="Payment status" options={Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            <ExportButton path="/v1/admin/exports/payments" module="demand_payments" fileName="payments.csv" />
          </Toolbar>
          <Panel flush>
            <DataTable
              flush
              caption="Payments"
              loading={list.isLoading}
              error={list.error}
              rows={list.rows}
              rowKey={(p) => p.id}
              onRowClick={setPayment}
              emptyTitle={status ? 'No payments with this status' : 'No payments yet'}
              emptyBody={status ? 'Choose another status or clear the filter.' : 'Payments appear when residents start paying for bookings or demand requests.'}
              columns={[
                {
                  header: 'Resident',
                  cell: (p) => (
                    <span className="primary-cell">
                      {p.resident.fullName ?? p.resident.phone}
                      <span className="sub">{p.reference ?? PURPOSE[p.purpose]}</span>
                    </span>
                  ),
                },
                { header: 'Purpose', cell: (p) => PURPOSE[p.purpose] },
                {
                  header: 'Amount',
                  className: 'num',
                  cell: (p) => (
                    <>
                      {formatRupees(p.amountPaise)}
                      {p.transaction?.refundedPaise ? sub(`${formatRupees(p.transaction.refundedPaise)} refunded`) : null}
                    </>
                  ),
                },
                {
                  header: 'Verified',
                  cell: (p) =>
                    p.transaction ? (
                      <>
                        {formatDateTime(p.transaction.verifiedAt)}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {p.transaction.method ? <span className="muted" style={{ fontSize: 12.5 }}>{p.transaction.method}</span> : null}
                          <CopyId value={p.transaction.providerPaymentId} label="Razorpay payment id" />
                        </span>
                      </>
                    ) : (
                      <span className="muted">Not verified</span>
                    ),
                },
                { header: 'Status', cell: (p) => <Pill status={p.status} label={PAYMENT_STATUS_LABEL[p.status]} /> },
                {
                  header: 'Actions',
                  className: 'actions',
                  cell: (p) => {
                    const refund = paymentRefund(p);
                    return refund ? (
                      <div className="row">
                        <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setRefundFor(refund)}>
                          Refund
                        </Button>
                      </div>
                    ) : null;
                  },
                },
              ]}
              footer={
                list.hasMore ? (
                  <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                    Load more
                  </Button>
                ) : null
              }
            />
          </Panel>
        </>
      )}

      <Drawer
        open={Boolean(payment)}
        onClose={() => setPayment(null)}
        title={payment ? `${formatRupees(payment.amountPaise)} · ${PURPOSE[payment.purpose]}` : 'Payment'}
        subtitle={payment ? (payment.resident.fullName ?? payment.resident.phone) : undefined}
        footer={
          payment && paymentRefund(payment) ? (
            <Button
              variant="secondary"
              icon={Undo2}
              onClick={() => {
                const r = paymentRefund(payment);
                if (r) setRefundFor(r);
              }}
            >
              Approve refund
            </Button>
          ) : undefined
        }
      >
        {payment ? (
          <div className="stack">
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <Pill status={payment.status} label={PAYMENT_STATUS_LABEL[payment.status]} />
              </dd>
              <dt>Resident</dt>
              <dd>
                {payment.resident.fullName ?? payment.resident.phone}
                {payment.resident.fullName ? sub(payment.resident.phone) : null}
              </dd>
              <dt>For</dt>
              <dd>
                {payment.refType === 'BOOKING' ? 'Booking' : 'Demand request'} {payment.reference ?? ''}
              </dd>
              <dt>Purpose</dt>
              <dd>{PURPOSE[payment.purpose]}</dd>
              <dt>Amount</dt>
              <dd>{formatRupees(payment.amountPaise)}</dd>
              <dt>Started</dt>
              <dd>{formatDateTime(payment.createdAt)}</dd>
              <dt>Razorpay order</dt>
              <dd>{payment.providerOrderId ? <CopyId value={payment.providerOrderId} label="Razorpay order id" /> : <span className="muted">None</span>}</dd>
            </dl>
            <h3 className="section-title" style={{ margin: 0 }}>
              Verified payment
            </h3>
            {payment.transaction ? (
              <dl className="kv">
                <dt>Razorpay payment</dt>
                <dd>
                  <CopyId value={payment.transaction.providerPaymentId} label="Razorpay payment id" />
                </dd>
                <dt>Captured</dt>
                <dd>{formatRupees(payment.transaction.amountPaise)}</dd>
                <dt>Method</dt>
                <dd>{payment.transaction.method ?? <span className="muted">Not reported</span>}</dd>
                <dt>Verified</dt>
                <dd>{formatDateTime(payment.transaction.verifiedAt)}</dd>
                <dt>Refunded</dt>
                <dd>
                  {formatRupees(payment.transaction.refundedPaise)}{' '}
                  <span className="muted">({TX_STATUS_LABEL[payment.transaction.status] ?? payment.transaction.status})</span>
                </dd>
              </dl>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No verified payment. The resident started paying but the server has not confirmed a capture.
              </p>
            )}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(exception)}
        onClose={() => setException(null)}
        title={exception ? reasonOf(exception.reasonCode).label : 'Exception'}
        subtitle={exception ? `Raised ${formatDateTime(exception.createdAt)}` : undefined}
        footer={
          exception && exception.status === 'OPEN' ? (
            <>
              {exceptionRefund(exception) ? (
                <Button
                  variant="secondary"
                  icon={Undo2}
                  onClick={() => {
                    const r = exceptionRefund(exception);
                    if (r) setRefundFor(r);
                  }}
                >
                  Approve refund
                </Button>
              ) : null}
              {canEdit ? (
                <Button icon={CircleCheck} onClick={() => setResolving(exception)}>
                  Resolve
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {exception ? (
          <div className="stack">
            <InfoBanner tone={exception.status === 'OPEN' ? 'warning' : 'success'}>{reasonOf(exception.reasonCode).explain}</InfoBanner>
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <Pill status={exception.status} label={exception.status === 'OPEN' ? 'Open' : 'Resolved'} />
              </dd>
              <dt>Detail</dt>
              <dd>{exception.detail ?? <span className="muted">None recorded</span>}</dd>
              <dt>Resident</dt>
              <dd>
                {exception.resident ? (
                  <>
                    {exception.resident.fullName ?? exception.resident.phone}
                    {exception.resident.fullName ? sub(exception.resident.phone) : null}
                  </>
                ) : (
                  <span className="muted">Unknown</span>
                )}
              </dd>
              <dt>Amount</dt>
              <dd>{exception.amountPaise === null ? <span className="muted">Not known</span> : formatRupees(exception.amountPaise)}</dd>
              {exception.status === 'RESOLVED' ? (
                <>
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(exception.resolvedAt)}</dd>
                  <dt>What was done</dt>
                  <dd>{exception.resolutionNote}</dd>
                </>
              ) : null}
            </dl>
            {exception.status === 'OPEN' && exception.reasonCode === 'UNAPPROVED_REFUND' ? (
              <p className="muted" style={{ margin: 0 }}>
                The money has already been returned in Razorpay, so there is nothing to approve here. Check why it was issued, then resolve this with a note.
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {refundFor ? <RefundDialog {...refundFor} onClose={() => setRefundFor(null)} /> : null}
      {resolving ? (
        <ResolveDialog
          exception={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            setException(null);
          }}
        />
      ) : null}
    </>
  );
}

function RefundDialog({ transactionId, maxPaise, who, onClose }: RefundTarget & { onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [amount, setAmount] = useState(String(maxPaise / 100));
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api<{ providerPaymentId: string }>(`/v1/admin/payment-transactions/${transactionId}/refunds`, { method: 'POST', body: { amountPaise: rupeesToPaise(amount), reason } }),
    onSuccess: async (r) => {
      setDone(r.providerPaymentId);
      toast('Refund approved');
      await qc.invalidateQueries({ queryKey: ['admin-payments'] });
      await qc.invalidateQueries({ queryKey: ['payment-exceptions'] });
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const paise = rupeesToPaise(amount);
  const submit = async () => {
    const r = await confirm({
      title: `Approve a refund of ${formatRupees(paise ?? 0)}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            This records your approval to refund {formatRupees(paise ?? 0)} to {who}
            {paise !== null && paise < maxPaise ? ` (of up to ${formatRupees(maxPaise)})` : ''}.
          </p>
          <p style={{ margin: 0 }}>The money is returned only when someone issues the refund in the Razorpay dashboard.</p>
        </div>
      ),
      confirmLabel: 'Approve refund',
      tone: 'warning',
    });
    if (r.ok) save.mutate();
  };
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
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={save.isPending} disabled={reason.trim().length < 3 || !paise} onClick={() => void submit()}>
              Approve
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="stack">
          <InfoBanner tone="success">Approved. Issue the refund in the Razorpay dashboard; it is recorded here automatically when Razorpay confirms it.</InfoBanner>
          <dl className="kv">
            <dt>Razorpay payment</dt>
            <dd>
              <CopyId value={done} label="Razorpay payment id" />
            </dd>
          </dl>
        </div>
      ) : (
        <div className="stack">
          <InfoBanner>Approving records your decision. The money is returned only when the refund is issued in Razorpay.</InfoBanner>
          <TextInput
            label="Amount (₹)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={err?.field('amountPaise') ?? (Number.isNaN(paise) ? 'Enter an amount like 1500 or 1500.50' : undefined)}
            hint={`Up to ${formatRupees(maxPaise)}`}
          />
          <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
          <ErrorBanner error={err?.fields.length ? null : save.error} />
        </div>
      )}
    </Modal>
  );
}

function ResolveDialog({ exception, onClose, onDone }: { exception: PaymentException; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/payment-exceptions/${exception.id}/resolve`, { method: 'POST', body: { note } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['payment-exceptions'] });
      toast('Exception resolved');
      onDone();
    },
  });
  const r = reasonOf(exception.reasonCode);
  return (
    <Modal
      open
      title="Resolve exception"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={note.trim().length < 3} onClick={() => save.mutate()}>
            Mark resolved
          </Button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          <strong>{r.label}</strong>
          {exception.amountPaise !== null ? ` · ${formatRupees(exception.amountPaise)}` : ''}
          <span className="muted" style={{ display: 'block' }}>
            {exception.detail ?? r.explain}
          </span>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Resolving moves it out of the review queue. It does not refund or change any payment.
        </p>
        <TextArea
          label="What was done"
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint="e.g. “Refunded in full”, “Resident contacted, booked another slot”."
        />
        <ErrorBanner error={save.error} />
      </div>
    </Modal>
  );
}
