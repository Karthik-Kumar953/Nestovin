import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingView, Checkout, ResidentDemandRequest } from '@nestovin/contracts';
import { api, errorMessage, idempotencyKey, rupees } from '../../lib/api';
import { PaymentCancelled, payWithRazorpay } from '../../lib/payments';
import { useMe } from './index';
import { Badge, Banner, Button, Card, Empty, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

const REQUEST_LABEL: Record<string, [string, 'success' | 'warning' | 'error' | 'info' | 'neutral']> = {
  AWAITING_PAYMENT: ['Awaiting payment', 'warning'],
  COMMITTED: ['Committed', 'success'],
  BALANCE_DUE: ['Balance due', 'warning'],
  CONVERTED: ['Booked', 'success'],
  EXPIRED: ['Expired', 'neutral'],
  CANCELLED: ['Cancelled', 'neutral'],
  REVIEW_REQUIRED: ['Under review', 'info'],
};
const BOOKING_LABEL: Record<string, [string, 'success' | 'warning' | 'error' | 'info' | 'neutral']> = {
  PENDING_PAYMENT: ['Awaiting payment', 'warning'],
  CONFIRMED: ['Confirmed', 'success'],
  CANCELLED: ['Cancelled', 'neutral'],
  EXPIRED: ['Expired', 'neutral'],
  REVIEW_REQUIRED: ['Under review', 'info'],
};

/** RES-09: demand requests, bookings, payment state and subscription periods, kept separate. */
export default function Bookings() {
  const qc = useQueryClient();
  const me = useMe();
  const requests = useQuery({ queryKey: ['demand-requests'], queryFn: () => api<{ items: ResidentDemandRequest[] }>('/v1/resident/demand-requests') });
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => api<{ items: BookingView[] }>('/v1/resident/bookings') });
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['demand-requests'] });
    await qc.invalidateQueries({ queryKey: ['bookings'] });
  };
  const run = useMutation({
    mutationFn: async (path: string) => {
      const res = await api<Checkout | { checkout: Checkout }>(path, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } });
      const checkout = 'checkout' in res ? res.checkout : res;
      return payWithRazorpay(checkout, { contact: me.data?.phone });
    },
    onSuccess: (r) => setNotice({ tone: r.orderStatus === 'PAID' ? 'success' : 'warning', text: r.message }),
    onError: (e) => setNotice({ tone: e instanceof PaymentCancelled ? 'warning' : 'error', text: errorMessage(e) }),
    onSettled: refresh,
  });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/v1/resident/demand-requests/${id}/cancel`, { method: 'POST' }), onSuccess: refresh });

  return (
    <Screen>
      <H1>Bookings and payments</H1>
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {cancel.error ? <Banner tone="error">{errorMessage(cancel.error)}</Banner> : null}

      <H2>Bookings</H2>
      {bookings.isLoading ? <Loading /> : null}
      {bookings.data?.items.length === 0 ? <Empty title="No bookings yet" /> : null}
      {(bookings.data?.items ?? []).map((b) => {
        const [label, tone] = BOOKING_LABEL[b.status] ?? [b.status, 'neutral'];
        return (
          <Card key={b.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <P style={{ fontWeight: '600' }}>{b.planName} · {b.selectionLabel}</P>
              <Badge label={label} tone={tone} />
            </Row>
            <P muted>{b.slot.label} · {b.slot.startTime} · starts {b.startDate}</P>
            <P>Paid {rupees(b.paidPaise)} of {rupees(b.totalPaise)}{b.outstandingPaise ? ` · due ${rupees(b.outstandingPaise)}` : ''}</P>
            {b.balanceDueAt ? <Banner tone="warning">Pay the balance by {new Date(b.balanceDueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} or the commitment expires.</Banner> : null}
            {b.subscription ? <P muted>Service period {b.subscription.periodStart} to {b.subscription.periodEnd} · {b.subscription.status === 'ACTIVE' ? 'active' : b.subscription.status === 'PENDING_ACTIVATION' ? 'starting soon' : b.subscription.status.toLowerCase()}</P> : null}
            {b.status === 'PENDING_PAYMENT' ? <Button title={b.mode === 'DEMAND_LED' ? `Pay balance ${rupees(b.outstandingPaise)}` : `Pay ${rupees(b.outstandingPaise)}`} busy={run.isPending && run.variables === `/v1/resident/bookings/${b.id}/pay`} onPress={() => run.mutate(`/v1/resident/bookings/${b.id}/pay`)} /> : null}
            {b.subscription?.renewable ? <Button title="Renew for the next period" variant="secondary" busy={run.isPending && run.variables === `/v1/resident/subscriptions/${b.subscription.id}/renew`} onPress={() => run.mutate(`/v1/resident/subscriptions/${b.subscription!.id}/renew`)} /> : null}
          </Card>
        );
      })}

      <H2>Demand requests</H2>
      {requests.data?.items.length === 0 ? <Empty title="No demand requests" /> : null}
      {(requests.data?.items ?? []).map((r) => {
        const [label, tone] = REQUEST_LABEL[r.status] ?? [r.status, 'neutral'];
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <P style={{ fontWeight: '600' }}>{r.planName} · {r.selectionLabel}</P>
              <Badge label={label} tone={tone} />
            </Row>
            <P muted>{r.cycleName} · preferred {r.preferredWindows.join(', ')}</P>
            <P>Initial {r.initialPct}%: {rupees(r.initialDuePaise)} · paid {rupees(r.initialPaidPaise)} · total {rupees(r.totalPaise)}</P>
            {r.status === 'AWAITING_PAYMENT' ? (
              <Row>
                <Button title={`Pay ${rupees(r.initialDuePaise)}`} busy={run.isPending && run.variables === `/v1/resident/demand-requests/${r.id}/pay`} onPress={() => run.mutate(`/v1/resident/demand-requests/${r.id}/pay`)} />
                <Button title="Cancel request" variant="ghost" busy={cancel.isPending} onPress={() => cancel.mutate(r.id)} />
              </Row>
            ) : null}
            {r.status === 'COMMITTED' ? <P muted>We will confirm your slot and start date, then ask for the balance.</P> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
