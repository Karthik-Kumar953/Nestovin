import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingDetail,
  BookingView,
  Checkout,
  ResidentDemandRequest,
} from '@nestovin/contracts';
import {
  Banner,
  Button,
  Card,
  Entrance,
  Icon,
  Screen,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { api, errorMessage } from '../../../lib/api';
import { payExisting, postWithKey, useCheckout } from '../../../lib/checkout';
import {
  dateTime,
  daysLabel,
  hhmm,
  longDate,
  rupees,
  shortDate,
  taskFrequency,
  today,
  validity,
} from '../../../lib/format';
import { keys, useBookings, useRequests } from '../../../lib/queries';
import { bookingStatus, requestStatus, subscriptionStatus } from '../../../lib/status';
import { ErrorState, KeyValue, TestPayButton, Timeline } from '../../../components/common';
import { serviceIcon } from '../../../assets/images';

/** Booking detail: progress timeline, amounts, the terms agreed, and the one action that is due. */
export default function BookingDetail() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: 'booking' | 'request' }>();
  const bookings = useBookings();
  const requests = useRequests();
  const booking = bookings.data?.find((b) => b.id === id);
  const request =
    requests.data?.find((r) => r.id === id) ?? requests.data?.find((r) => r.bookingId === id);
  const loading = bookings.isLoading || requests.isLoading;

  if (loading)
    return (
      <Screen title="Booking" onBack={() => router.back()}>
        <SkeletonList count={3} />
      </Screen>
    );
  if (kind === 'request' && request && !request.bookingId) return <RequestDetail r={request} />;
  const b =
    booking ??
    (request?.bookingId ? bookings.data?.find((x) => x.id === request.bookingId) : undefined);
  if (b) return <BookingDetailView b={b} request={request} />;
  if (request) return <RequestDetail r={request} />;
  return (
    <Screen title="Booking" onBack={() => router.back()}>
      <ErrorState
        error={bookings.error ?? requests.error ?? new Error('We could not find this booking.')}
        onRetry={() => void Promise.all([bookings.refetch(), requests.refetch()])}
      />
    </Screen>
  );
}

function BookingDetailView({ b, request }: { b: BookingView; request?: ResidentDemandRequest }) {
  const st = bookingStatus(b.status, b.mode, b.outstandingPaise);
  const pay = useCheckout();
  const payBooking = (test = false) =>
    pay.start({
      test,
      purpose: b.mode === 'DEMAND_LED' ? 'balance' : 'retry',
      path: `/v1/resident/bookings/${b.id}/pay`,
      create: async (key) => ({
        checkout: await payExisting(`/v1/resident/bookings/${b.id}/pay`, key),
        id: b.id,
        kind: 'booking',
        reference: b.reference,
      }),
    });
  const renew = (test = false) =>
    pay.start({
      test,
      purpose: 'renew',
      path: `/v1/resident/subscriptions/${b.subscription!.id}/renew`,
      create: async (key) => {
        const r = await postWithKey<{ booking: BookingView; checkout: Checkout }>(
          `/v1/resident/subscriptions/${b.subscription!.id}/renew`,
          key,
        );
        return {
          checkout: r.checkout,
          id: r.booking.id,
          kind: 'booking',
          reference: r.booking.reference,
        };
      },
    });
  const detail = useQuery({
    queryKey: [...keys.bookings, 'detail', b.id],
    queryFn: () => api<BookingDetail>(`/v1/resident/bookings/${b.id}`),
  });
  const started = b.startDate <= today();
  const demand = b.mode === 'DEMAND_LED';
  const steps = demand
    ? [
        {
          title: 'Joined booking round',
          detail: request
            ? `${request.cycleName} · paid ${rupees(request.initialPaidPaise)}`
            : 'Joining payment received',
          state: 'done' as const,
        },
        {
          title: `Slot confirmed: ${b.slot.label} at ${hhmm(b.slot.startTime)}`,
          detail: `${daysLabel(b.slot.daysOfWeek)} · starts ${shortDate(b.startDate)}`,
          state: 'done' as const,
        },
        {
          title: b.outstandingPaise ? 'Pay the balance' : 'Balance paid',
          detail: b.outstandingPaise
            ? b.balanceDueAt
              ? `Due by ${dateTime(b.balanceDueAt)}`
              : rupees(b.outstandingPaise)
            : null,
          state: b.outstandingPaise ? ('current' as const) : ('done' as const),
          tone: 'warning' as const,
        },
        {
          title: 'Service starts',
          detail: b.subscription
            ? `${shortDate(b.subscription.periodStart)} to ${shortDate(b.subscription.periodEnd)}`
            : longDate(b.startDate),
          state: started && b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const),
        },
      ]
    : [
        {
          title: b.status === 'PENDING_PAYMENT' ? 'Payment pending' : 'Paid in full',
          detail: rupees(b.totalPaise),
          state: b.status === 'PENDING_PAYMENT' ? ('current' as const) : ('done' as const),
          tone: 'warning' as const,
        },
        {
          title: 'Booking confirmed',
          detail: `${b.slot.label} at ${hhmm(b.slot.startTime)} · ${daysLabel(b.slot.daysOfWeek)}`,
          state: b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const),
        },
        {
          title: 'Service starts',
          detail: b.subscription
            ? `${shortDate(b.subscription.periodStart)} to ${shortDate(b.subscription.periodEnd)}`
            : longDate(b.startDate),
          state: started && b.status === 'CONFIRMED' ? ('done' as const) : ('todo' as const),
        },
      ];

  return (
    <Screen
      title="Booking"
      onBack={() => router.back()}
      footer={
        b.status === 'PENDING_PAYMENT' || b.subscription?.renewable ? (
          <>
            {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
            {b.status === 'PENDING_PAYMENT' ? (
              <>
                <Button
                  title={`${demand ? 'Pay balance' : 'Pay'} ${rupees(b.outstandingPaise)}`}
                  icon="lock-closed"
                  loading={pay.busy}
                  onPress={() => void payBooking()}
                  accessibilityHint="Opens secure payment"
                />
                <TestPayButton busy={pay.busy} onPress={() => void payBooking(true)} />
              </>
            ) : (
              <>
                <Button
                  title="Renew for the next period"
                  icon="refresh"
                  loading={pay.busy}
                  onPress={() => void renew()}
                  accessibilityHint="Opens secure payment"
                />
                <TestPayButton busy={pay.busy} onPress={() => void renew(true)} />
              </>
            )}
          </>
        ) : undefined
      }
    >
      <Card raised className="gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1.5 flex-1">
            <Icon name={serviceIcon(b.selectionLabel)} size={16} color={colors.tealAction} />
            <Text variant="label" tone="brand" numberOfLines={1} className="flex-1">
              {b.selectionLabel}
            </Text>
          </View>
          <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
        </View>
        <Text variant="h2">{b.planName}</Text>
        <Text variant="sm" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {`${b.reference} · ${demand ? 'Booking round' : 'Continuous'}`}
        </Text>
        {b.subscription ? <StatusChip {...subscriptionStatus(b.subscription.status)} /> : null}
      </Card>

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
          {detail.data?.terms.taxPaise ? (
            <KeyValue label="Of which taxes" value={rupees(detail.data.terms.taxPaise)} />
          ) : null}
          <KeyValue label="Paid" value={rupees(b.paidPaise)} />
          <View className="h-px bg-line" />
          <KeyValue
            label="Balance"
            value={rupees(b.outstandingPaise)}
            strong
            tone={b.outstandingPaise ? 'warning' : undefined}
          />
          {demand && b.outstandingPaise ? (
            <Text variant="sm" tone="muted">
              If the balance is not paid by the deadline, the booking expires and the amount paid to
              join is not refunded.
            </Text>
          ) : null}
        </Card>
      </Entrance>

      {detail.data?.payments.length ? <Payments items={detail.data.payments} /> : null}
      {detail.data ? (
        <AgreedTerms terms={detail.data.terms} />
      ) : (
        <Terms demand={demand} pct={request?.initialPct} />
      )}
      <Button
        title="Get help with this booking"
        variant="tertiary"
        icon="chatbubbles-outline"
        onPress={() =>
          router.push({ pathname: '/ticket/new', params: { subject: `Booking ${b.reference}` } })
        }
      />
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
  const payRequest = (test = false) =>
    pay.start({
      test,
      purpose: 'join',
      path: `/v1/resident/demand-requests/${r.id}/pay`,
      create: async (key) => ({
        checkout: await payExisting(`/v1/resident/demand-requests/${r.id}/pay`, key),
        id: r.id,
        kind: 'request',
        reference: r.reference,
      }),
    });
  const paid = r.initialPaidPaise >= r.initialDuePaise && r.initialDuePaise > 0;
  const confirmCancel = () =>
    Alert.alert('Cancel this request?', 'You have not paid for it yet, so nothing is charged.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate() },
    ]);

  return (
    <Screen
      title="Booking round"
      onBack={() => router.back()}
      footer={
        r.status === 'AWAITING_PAYMENT' ? (
          <>
            {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
            {cancel.error ? <Banner tone="error">{errorMessage(cancel.error)}</Banner> : null}
            <Button
              title={`Pay ${rupees(r.initialDuePaise)} and join`}
              icon="lock-closed"
              loading={pay.busy}
              onPress={() => void payRequest()}
              accessibilityHint="Opens secure payment"
            />
            <TestPayButton busy={pay.busy} onPress={() => void payRequest(true)} />
            <Button
              title="Cancel request"
              variant="tertiary"
              loading={cancel.isPending}
              onPress={confirmCancel}
            />
          </>
        ) : undefined
      }
    >
      <Card raised className="gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1.5 flex-1">
            <Icon name="time-outline" size={16} color={colors.tealAction} />
            <Text variant="label" tone="brand" numberOfLines={1} className="flex-1">
              {r.cycleName}
            </Text>
          </View>
          <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
        </View>
        <Text variant="h2">{r.planName}</Text>
        <Text variant="sm" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {`${r.reference} · ${r.selectionLabel}`}
        </Text>
      </Card>
      {r.status === 'COMMITTED' ? (
        <Banner tone="info" title="Not a confirmed service yet">
          When the round closes we publish your slot and the balance due date. We will notify you.
        </Banner>
      ) : null}
      {r.status === 'REVIEW_REQUIRED' ? (
        <Banner tone="warning" title="Under review">
          Our team is checking this request and will contact you. You will not be charged again.
        </Banner>
      ) : null}

      <Card className="gap-4">
        <Text variant="h3">Progress</Text>
        <Timeline
          steps={[
            {
              title: paid ? 'Joined booking round' : 'Pay to join',
              detail: paid ? `Paid ${rupees(r.initialPaidPaise)}` : rupees(r.initialDuePaise),
              state: paid ? 'done' : 'current',
              tone: 'warning',
            },
            {
              title: 'Round closes and your slot is confirmed',
              detail: `Preferred: ${r.preferredWindows.join(', ')}`,
              state:
                paid && r.status === 'COMMITTED'
                  ? 'current'
                  : ['BALANCE_DUE', 'CONVERTED'].includes(r.status)
                    ? 'done'
                    : 'todo',
            },
            {
              title: 'Pay the balance',
              detail: rupees(r.remainingDuePaise),
              state:
                r.status === 'BALANCE_DUE' ? 'current' : r.status === 'CONVERTED' ? 'done' : 'todo',
              tone: 'warning',
            },
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
        <KeyValue
          label="Balance after slot confirmation"
          value={rupees(r.remainingDuePaise)}
          strong
        />
      </Card>
      {r.bookingId ? (
        <Button
          title="View booking"
          variant="secondary"
          onPress={() =>
            router.replace({
              pathname: '/bookings/[id]',
              params: { id: r.bookingId!, kind: 'booking' },
            })
          }
        />
      ) : null}
      <Terms demand pct={r.initialPct} />
      <Button
        title="Get help with this request"
        variant="tertiary"
        icon="chatbubbles-outline"
        onPress={() =>
          router.push({
            pathname: '/ticket/new',
            params: { subject: `Booking round request ${r.reference}` },
          })
        }
      />
    </Screen>
  );
}

function Terms({ demand, pct }: { demand: boolean; pct?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <Pressable
        onPress={() => setOpen(!open)}
        android_ripple={{ color: colors.teal100 }}
        accessibilityRole="button"
        aria-expanded={open}
        className="flex-row items-center justify-between min-h-[56px] px-4"
      >
        <Text variant="bodyStrong">What you agreed to</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View className="px-4 pb-4 gap-2">
          <Text variant="body" tone="muted">
            Plan, tasks, prices{demand ? ' and payment split' : ''} as they were when you paid.
            Later catalogue changes do not affect this booking.
          </Text>
          {demand && pct ? (
            <Text
              variant="body"
              tone="muted"
            >{`The ${pct}% paid to join is non-refundable if the balance is not paid by the deadline.`}</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const PURPOSE = { INITIAL: 'Joining payment', BALANCE: 'Balance', FULL: 'Full payment' } as const;
const PAY_STATUS = {
  CREATED: { label: 'Not completed', tone: 'neutral' as const },
  PAID: { label: 'Paid', tone: 'success' as const },
  FAILED: { label: 'Failed', tone: 'error' as const },
  EXPIRED: { label: 'Expired', tone: 'neutral' as const },
  REVIEW_REQUIRED: { label: 'Under review', tone: 'warning' as const },
};

/** Every payment attempt on this booking, oldest first (from GET /bookings/:id). */
function Payments({ items }: { items: BookingDetail['payments'] }) {
  return (
    <Card className="gap-3">
      <Text variant="h3">Payments</Text>
      {items.map((p) => {
        const st = PAY_STATUS[p.status];
        return (
          <View
            key={p.id}
            className="flex-row items-center gap-3"
            accessible
            accessibilityLabel={`${PURPOSE[p.purpose]}, ${rupees(p.amountPaise)}, ${st.label}`}
          >
            <View className="flex-1 gap-0.5">
              <Text variant="bodyStrong">{`${PURPOSE[p.purpose]} · ${rupees(p.amountPaise)}`}</Text>
              <Text variant="sm" tone="muted">
                {dateTime(p.paidAt ?? p.createdAt)}
              </Text>
            </View>
            <StatusChip label={st.label} tone={st.tone} />
          </View>
        );
      })}
    </Card>
  );
}

/** The plan as it was when the resident paid: services, cadence, tasks and payment terms (snapshot). */
function AgreedTerms({ terms }: { terms: BookingDetail['terms'] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <Pressable
        onPress={() => setOpen(!open)}
        android_ripple={{ color: colors.teal100 }}
        accessibilityRole="button"
        aria-expanded={open}
        className="flex-row items-center justify-between min-h-[56px] px-4"
      >
        <Text variant="bodyStrong">What you agreed to</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <View className="px-5 pb-5 gap-4">
          {terms.components.map((c, i) => (
            <View key={`${c.serviceName}-${i}`} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <Icon name={serviceIcon(c.serviceName)} size="sm" color={colors.tealDeep} />
                <Text variant="bodyStrong" className="flex-1">
                  {c.isAddon ? `${c.serviceName} (add-on)` : c.serviceName}
                </Text>
              </View>
              <Text variant="sm" tone="muted">
                {[
                  `${c.visitsPerDay} visit${c.visitsPerDay > 1 ? 's' : ''} a day`,
                  `${c.durationMinutes} min`,
                  daysLabel(c.daysOfWeek),
                  c.addonHours ? `${c.addonHours} hours a day` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {c.tasks.map((t) => (
                <View key={t.name} className="flex-row items-center gap-2 pl-6">
                  <Icon name="checkmark" size={14} color={colors.greenAction} />
                  <Text variant="sm" className="flex-1">
                    {t.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {taskFrequency(t.frequency, t.timesPerPeriod)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          <View className="h-px bg-line" />
          <KeyValue label="Plan length" value={validity(terms.validityDays)} />
          {terms.initialPct !== null ? (
            <KeyValue label="Paid to join" value={`${terms.initialPct}%, non-refundable`} />
          ) : null}
          {terms.disclosureAcceptedAt ? (
            <Text
              variant="sm"
              tone="muted"
            >{`Payment terms accepted ${dateTime(terms.disclosureAcceptedAt)}.`}</Text>
          ) : null}
          <Text variant="sm" tone="muted">
            Later catalogue changes do not affect this booking.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
