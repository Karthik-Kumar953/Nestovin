import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingView, Checkout, ResidentDemandRequest } from '@nestovin/contracts';
import { Banner, Button, Card, Entrance, Icon, Screen, SkeletonList, StatusChip, Text, colors } from '@nestovin/ui-native';
import { api, errorMessage, idempotencyKey } from '../../../lib/api';
import { payExisting, useCheckout } from '../../../lib/checkout';
import { dateTime, daysLabel, hhmm, longDate, rupees, shortDate, today } from '../../../lib/format';
import { keys, useBookings, useRequests } from '../../../lib/queries';
import { bookingStatus, requestStatus, subscriptionStatus } from '../../../lib/status';
import { ErrorState, KeyValue, Timeline } from '../../../components/common';

/** Booking detail: progress timeline, amounts, the terms agreed, and the one action that is due. */
export default function BookingDetail() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'booking' | 'request' }>();
  const bookings = useBookings();
  const requests = useRequests();
  const booking = bookings.data?.find((b) => b.id === id);
  const request = requests.data?.find((r) => r.id === id) ?? requests.data?.find((r) => r.bookingId === id);
  const loading = bookings.isLoading || requests.isLoading;

  if (loading) return <Screen title="Booking" onBack={() => router.back()}><SkeletonList count={3} /></Screen>;
  if (kind === 'request' && request && !request.bookingId) return <RequestDetail r={request} />;
  const b = booking ?? (request?.bookingId ? bookings.data?.find((x) => x.id === request.bookingId) : undefined);
  if (b) return <BookingDetailView b={b} request={request} />;
  if (request) return <RequestDetail r={request} />;
  return (
    <Screen title="Booking" onBack={() => router.back()}>
      <ErrorState error={bookings.error ?? requests.error ?? new Error('We could not find this booking.')} onRetry={() => void Promise.all([bookings.refetch(), requests.refetch()])} />
    </Screen>
  );
}

function BookingDetailView({ b, request }: { b: BookingView; request?: ResidentDemandRequest }) {
  const st = bookingStatus(b.status, b.mode, b.outstandingPaise);
  const pay = useCheckout();
  const started = b.startDate <= today();
  const demand = b.mode === 'DEMAND_LED';
  const steps = demand
    ? [
        { title: 'Joined booking round', detail: request ? `${request.cycleName} · paid ${rupees(request.initialPaidPaise)}` : 'Joining payment received', state: 'done' as const },
        { title: `Slot confirmed: ${b.slot.label} at ${hhmm(b.slot.startTime)}`, detail: `${daysLabel(b.slot.daysOfWeek)} · starts ${shortDate(b.startDate)}`, state: 'done' as const },
        {
          title: b.outstandingPaise ? 'Pay the balance' : 'Balance paid',
          detail: b.outstandingPaise ? (b.balanceDueAt ? `Due by ${dateTime(b.balanceDueAt)}` : rupees(b.outstandingPaise)) : null,
          state: b.outstandingPaise ? ('current' as const) : ('done' as const),
          tone: 'warning' as const,
        },
        { title: 'Service starts', detail: b.subscription ? `${shortDate(b.subscription.periodStart)} to ${shortDate(b.subscription.periodEnd)}` : longDate(b.startDate), state: started && b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const) },
      ]
    : [
        { title: b.status === 'PENDING_PAYMENT' ? 'Payment pending' : 'Paid in full', detail: rupees(b.totalPaise), state: b.status === 'PENDING_PAYMENT' ? ('current' as const) : ('done' as const), tone: 'warning' as const },
        { title: 'Booking confirmed', detail: `${b.slot.label} at ${hhmm(b.slot.startTime)} · ${daysLabel(b.slot.daysOfWeek)}`, state: b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const) },
        { title: 'Service starts', detail: b.subscription ? `${shortDate(b.subscription.periodStart)} to ${shortDate(b.subscription.periodEnd)}` : longDate(b.startDate), state: started && b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const) },
      ];

  return (
    <Screen
      title={b.planName}
      eyebrow={`${b.reference} · ${demand ? 'Booking round' : 'Continuous'}`}
      onBack={() => router.back()}
      footer={
        b.status === 'PENDING_PAYMENT' || b.subscription?.renewable ? (
          <>
            {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
            {b.status === 'PENDING_PAYMENT' ? (
              <Button
                title={`${demand ? 'Pay balance' : 'Pay'} ${rupees(b.outstandingPaise)}`}
                icon="lock-closed"
                loading={pay.busy}
                onPress={() => void pay.start({ purpose: demand ? 'balance' : 'retry', create: async () => ({ checkout: await payExisting(`/v1/resident/bookings/${b.id}/pay`), id: b.id, kind: 'booking', reference: b.reference }) })}
              />
            ) : (
              <Button
                title="Renew for the next period"
                icon="refresh"
                loading={pay.busy}
                onPress={() =>
                  void pay.start({
                    purpose: 'renew',
                    create: async () => {
                      const r = await api<{ booking: BookingView; checkout: Checkout }>(`/v1/resident/subscriptions/${b.subscription!.id}/renew`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } });
                      return { checkout: r.checkout, id: r.booking.id, kind: 'booking', reference: r.booking.reference };
                    },
                  })
                }
              />
            )}
          </>
        ) : undefined
      }
    >
      <View className="flex-row flex-wrap gap-2">
        <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
        {b.subscription ? <StatusChip {...subscriptionStatus(b.subscription.status)} /> : null}
      </View>
      <Text variant="body" tone="muted">{b.selectionLabel}</Text>

      <Entrance>
        <Card className="gap-4">
          <Text variant="h3">Progress</Text>
          <Timeline steps={steps} />
        </Card>
      </Entrance>

      <Entrance index={1}>
        <Card className="gap-3">
          <Text variant="h3">Amounts</Text>
          <KeyValue label="Plan total, incl. taxes" value={rupees(b.totalPaise)} />
          <KeyValue label="Paid" value={rupees(b.paidPaise)} />
          <View className="h-px bg-line" />
          <KeyValue label="Balance" value={rupees(b.outstandingPaise)} strong tone={b.outstandingPaise ? 'warning' : undefined} />
          {demand && b.outstandingPaise ? <Text variant="sm" tone="muted">If the balance is not paid by the deadline, the booking expires and the amount paid to join is not refunded.</Text> : null}
        </Card>
      </Entrance>

      <Terms demand={demand} pct={request?.initialPct} />
      <Button title="Get help with this booking" variant="tertiary" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/ticket/new', params: { subject: `Booking ${b.reference}` } })} />
    </Screen>
  );
}

function RequestDetail({ r }: { r: ResidentDemandRequest }) {
  const qc = useQueryClient();
  const st = requestStatus(r.status);
  const pay = useCheckout();
  const cancel = useMutation({
    mutationFn: () => api(`/v1/resident/demand-requests/${r.id}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.requests });
      router.back();
    },
  });
  const paid = r.initialPaidPaise >= r.initialDuePaise && r.initialDuePaise > 0;
  const confirmCancel = () =>
    Alert.alert('Cancel this request?', 'You have not paid for it yet, so nothing is charged.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate() },
    ]);

  return (
    <Screen
      title={r.planName}
      eyebrow={`${r.reference} · Booking round`}
      onBack={() => router.back()}
      footer={
        r.status === 'AWAITING_PAYMENT' ? (
          <>
            {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
            {cancel.error ? <Banner tone="error">{errorMessage(cancel.error)}</Banner> : null}
            <Button title={`Pay ${rupees(r.initialDuePaise)} and join`} icon="lock-closed" loading={pay.busy} onPress={() => void pay.start({ purpose: 'join', create: async () => ({ checkout: await payExisting(`/v1/resident/demand-requests/${r.id}/pay`), id: r.id, kind: 'request', reference: r.reference }) })} />
            <Button title="Cancel request" variant="tertiary" loading={cancel.isPending} onPress={confirmCancel} />
          </>
        ) : undefined
      }
    >
      <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
      <Text variant="body" tone="muted">{`${r.selectionLabel} · ${r.cycleName}`}</Text>
      {r.status === 'COMMITTED' ? <Banner tone="info" title="Not a confirmed service yet">When the round closes we publish your slot and the balance due date. We will notify you.</Banner> : null}
      {r.status === 'REVIEW_REQUIRED' ? <Banner tone="warning" title="Under review">Our team is checking this request and will contact you. You will not be charged again.</Banner> : null}

      <Card className="gap-4">
        <Text variant="h3">Progress</Text>
        <Timeline
          steps={[
            { title: paid ? 'Joined booking round' : 'Pay to join', detail: paid ? `Paid ${rupees(r.initialPaidPaise)}` : rupees(r.initialDuePaise), state: paid ? 'done' : 'current', tone: 'warning' },
            { title: 'Round closes and your slot is confirmed', detail: `Preferred: ${r.preferredWindows.join(', ')}`, state: paid && r.status === 'COMMITTED' ? 'current' : ['BALANCE_DUE', 'CONVERTED'].includes(r.status) ? 'done' : 'todo' },
            { title: 'Pay the balance', detail: rupees(r.remainingDuePaise), state: r.status === 'BALANCE_DUE' ? 'current' : r.status === 'CONVERTED' ? 'done' : 'todo', tone: 'warning' },
            { title: 'Service starts', state: r.status === 'CONVERTED' ? 'done' : 'todo' },
          ]}
        />
      </Card>

      <Card className="gap-3">
        <Text variant="h3">Amounts</Text>
        <KeyValue label="Plan total, incl. taxes" value={rupees(r.totalPaise)} />
        <KeyValue label={`To join (${r.initialPct}%)`} value={rupees(r.initialDuePaise)} />
        <KeyValue label="Paid" value={rupees(r.initialPaidPaise)} />
        <View className="h-px bg-line" />
        <KeyValue label="Balance after slot confirmation" value={rupees(r.remainingDuePaise)} strong />
      </Card>
      {r.bookingId ? <Button title="View booking" variant="secondary" onPress={() => router.replace({ pathname: '/bookings/[id]', params: { id: r.bookingId!, kind: 'booking' } })} /> : null}
      <Terms demand pct={r.initialPct} />
      <Button title="Get help with this request" variant="tertiary" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/ticket/new', params: { subject: `Booking round request ${r.reference}` } })} />
    </Screen>
  );
}

function Terms({ demand, pct }: { demand: boolean; pct?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Card tone="subtle" padded={false}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center justify-between min-h-[56px] px-5">
        <Text variant="bodyStrong">What you agreed to</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View className="px-5 pb-5 gap-2">
          <Text variant="body" tone="muted">Plan, tasks, prices{demand ? ' and payment split' : ''} as they were when you paid. Later catalogue changes do not affect this booking.</Text>
          {demand && pct ? <Text variant="body" tone="muted">{`The ${pct}% paid to join is non-refundable if the balance is not paid by the deadline.`}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}
