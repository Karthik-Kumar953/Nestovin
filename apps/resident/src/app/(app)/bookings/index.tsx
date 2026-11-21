import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { BookingView, ResidentDemandRequest } from '@nestovin/contracts';
import {
  Button,
  Card,
  EmptyState,
  Entrance,
  Icon,
  Screen,
  SegmentedControl,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { useBookings, useRequests } from '../../../lib/queries';
import { dateTime, hhmm, rupees, shortDate } from '../../../lib/format';
import { bookingStatus, requestStatus } from '../../../lib/status';
import { img, serviceIcon } from '../../../assets/images';
import { ErrorState, Progress } from '../../../components/common';

/** RES-09: bookings and booking-round requests, kept separate (a request is never a confirmed booking). */
export default function Bookings() {
  const bookings = useBookings();
  const requests = useRequests();
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const refresh = () => Promise.all([bookings.refetch(), requests.refetch()]);

  const all = bookings.data ?? [];
  const reqs = (requests.data ?? []).filter((r) => r.status !== 'CONVERTED');
  const isPast = (b: BookingView) =>
    ['CANCELLED', 'EXPIRED'].includes(b.status) || b.subscription?.status === 'ENDED';
  const current = all.filter((b) => !isPast(b));
  const past = all.filter(isPast);
  const openReqs = reqs.filter((r) => !['EXPIRED', 'CANCELLED'].includes(r.status));
  const pastReqs = reqs.filter((r) => ['EXPIRED', 'CANCELLED'].includes(r.status));
  const shownBookings = tab === 'current' ? current : past;
  const shownReqs = tab === 'current' ? openReqs : pastReqs;

  return (
    <Screen
      title="Bookings"
      onBack={() => router.back()}
      onRefresh={() => void refresh()}
      refreshing={bookings.isRefetching}
    >
      <SegmentedControl
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'current', label: 'Current' },
          { value: 'past', label: 'Past' },
        ]}
      />
      {bookings.isLoading || requests.isLoading ? <SkeletonList count={3} /> : null}
      {bookings.error ? (
        <ErrorState error={bookings.error} onRetry={() => void refresh()} compact />
      ) : null}

      {shownReqs.length ? (
        <View className="gap-3">
          <Text variant="label" tone="muted" accessibilityRole="header" className="px-1">
            Booking round requests
          </Text>
          {shownReqs.map((r, i) => (
            <Entrance key={r.id} index={i}>
              <RequestCard r={r} />
            </Entrance>
          ))}
        </View>
      ) : null}

      {shownBookings.length ? (
        <View className="gap-3">
          {shownReqs.length ? (
            <Text variant="label" tone="muted" accessibilityRole="header" className="px-1">
              Bookings
            </Text>
          ) : null}
          {shownBookings.map((b, i) => (
            <Entrance key={b.id} index={i + shownReqs.length}>
              <BookingCard b={b} />
            </Entrance>
          ))}
        </View>
      ) : null}

      {!bookings.isLoading &&
      !requests.isLoading &&
      !bookings.error &&
      !shownBookings.length &&
      !shownReqs.length ? (
        <EmptyState
          illustration={img('ill-empty-visits.png')}
          icon="receipt-outline"
          title={tab === 'current' ? 'No bookings yet' : 'Nothing here yet'}
          body={
            tab === 'current'
              ? 'Plans you book or booking rounds you join appear here.'
              : 'Ended, expired and cancelled bookings appear here.'
          }
        >
          {tab === 'current' ? (
            <Button title="Explore plans" onPress={() => router.push('/book')} />
          ) : null}
        </EmptyState>
      ) : null}
    </Screen>
  );
}

function BookingCard({ b }: { b: BookingView }) {
  const st = bookingStatus(b.status, b.mode, b.outstandingPaise);
  return (
    <Card
      onPress={() =>
        router.push({ pathname: '/bookings/[id]', params: { id: b.id, kind: 'booking' } })
      }
      accessibilityLabel={`${b.planName}, ${b.selectionLabel}, ${st.label}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5 flex-1">
          <Icon name={serviceIcon(b.selectionLabel)} size={16} color={colors.tealAction} />
          <Text variant="label" tone="brand" numberOfLines={1} className="flex-1">
            {b.selectionLabel}
          </Text>
        </View>
        <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
      </View>
      <View className="gap-0.5">
        <Text variant="h3">{b.planName}</Text>
        <Text variant="sm" tone="muted">{`${b.slot.label} · ${hhmm(b.slot.startTime)}`}</Text>
      </View>
      <Progress
        value={b.totalPaise ? b.paidPaise / b.totalPaise : 0}
        label={`Paid ${rupees(b.paidPaise)} of ${rupees(b.totalPaise)}`}
      />
      <View className="flex-row justify-between">
        <Text
          variant="sm"
          tone="muted"
        >{`Paid ${rupees(b.paidPaise)} of ${rupees(b.totalPaise)}`}</Text>
        <Text
          variant="sm"
          tone={b.outstandingPaise ? 'warning' : 'muted'}
          className={b.outstandingPaise ? 'font-semibold' : ''}
        >
          {b.outstandingPaise && b.balanceDueAt
            ? `Due ${dateTime(b.balanceDueAt)}`
            : b.subscription
              ? `${shortDate(b.subscription.periodStart)} to ${shortDate(b.subscription.periodEnd)}`
              : `Starts ${shortDate(b.startDate)}`}
        </Text>
      </View>
    </Card>
  );
}

function RequestCard({ r }: { r: ResidentDemandRequest }) {
  const st = requestStatus(r.status);
  return (
    <Card
      onPress={() =>
        router.push({ pathname: '/bookings/[id]', params: { id: r.id, kind: 'request' } })
      }
      accessibilityLabel={`${r.planName}, ${r.cycleName}, ${st.label}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5 flex-1">
          <Icon name="time-outline" size={16} color={colors.tealAction} />
          <Text variant="label" tone="brand" numberOfLines={1} className="flex-1">
            {r.cycleName}
          </Text>
        </View>
        <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
      </View>
      <View className="gap-0.5">
        <Text variant="h3">{r.planName}</Text>
        <Text variant="sm" tone="muted">
          {r.selectionLabel}
        </Text>
      </View>
      <View className="h-px bg-line" />
      <Text variant="sm" tone="muted">{`Preferred: ${r.preferredWindows.join(', ')}`}</Text>
      <Text
        variant="sm"
        tone="muted"
        style={{ fontVariant: ['tabular-nums'] }}
      >{`Joining payment ${rupees(r.initialPaidPaise)} of ${rupees(r.initialDuePaise)} · total ${rupees(r.totalPaise)}`}</Text>
    </Card>
  );
}
