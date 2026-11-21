import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ResidentVisit } from '@nestovin/contracts';
import { Button, EmptyState, Entrance, Screen, SegmentedControl, SkeletonList, Text } from '@nestovin/ui-native';
import { useMe, useUpcomingVisits, useVisitHistory } from '../../../lib/queries';
import { dayLabel, monthLabel, today } from '../../../lib/format';
import { img } from '../../../assets/images';
import { ErrorState, FloatingAction, OfflineNotice } from '../../../components/common';
import { VisitRow } from '../../../components/VisitRow';

/** RES-10/11: upcoming visits by day, and history by month with "Load earlier" (no 30-day cap). */
export default function Visits() {
  const me = useMe();
  const verified = me.data?.membership?.status === 'VERIFIED';
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const upcoming = useUpcomingVisits(verified, 14);
  const history = useVisitHistory(verified && tab === 'history');
  const codeVisit = upcoming.data?.find((v) => v.canShowCode);

  const refresh = () => (tab === 'upcoming' ? upcoming.refetch() : history.refetch());

  return (
    <View className="flex-1">
      <Screen title="Visits" onRefresh={() => void refresh()} refreshing={upcoming.isRefetching || history.isRefetching} bottomInset={codeVisit ? 76 : 0}>
        <SegmentedControl label="Visits" value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'history', label: 'History' }]} />
        <OfflineNotice />
        {!verified && !me.isLoading ? (
          <EmptyState illustration={img('ill-empty-visits.png')} icon="calendar-outline" title="No visits yet" body="Visits appear here once your residence is verified and you have a booking.">
            <Button title="Go to Home" variant="secondary" onPress={() => router.push('/')} />
          </EmptyState>
        ) : tab === 'upcoming' ? (
          <Upcoming items={upcoming.data} loading={upcoming.isLoading} error={upcoming.error} retry={() => void upcoming.refetch()} />
        ) : (
          <History q={history} />
        )}
      </Screen>
      {codeVisit ? <FloatingAction label="Show check-in code" icon="qr-code-outline" onPress={() => router.push({ pathname: '/check-in/[id]', params: { id: codeVisit.occurrenceId } })} /> : null}
    </View>
  );
}

function Upcoming({ items, loading, error, retry }: { items?: ResidentVisit[]; loading: boolean; error: unknown; retry: () => void }) {
  if (loading) return <SkeletonList count={4} />;
  if (error) return <ErrorState error={error} onRetry={retry} compact />;
  const list = (items ?? []).filter((v) => !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(v.status));
  if (!list.length) {
    return (
      <EmptyState illustration={img('ill-empty-visits.png')} icon="calendar-outline" title="No upcoming visits" body="Visits appear here once your booking has a confirmed slot.">
        <Button title="Explore plans" variant="secondary" onPress={() => router.push('/book')} />
      </EmptyState>
    );
  }
  const days = [...new Set(list.map((v) => v.scheduledDate))];
  let n = 0;
  return (
    <View className="gap-5">
      {days.map((d) => (
        <View key={d} className="gap-3">
          <Text variant="overline" tone={d === today() ? 'brand' : 'muted'} accessibilityRole="header">
            {dayLabel(d)}
          </Text>
          {list
            .filter((v) => v.scheduledDate === d)
            .map((v) => (
              <Entrance key={v.occurrenceId} index={n++}>
                <VisitRow v={v} highlight={d === today()} />
              </Entrance>
            ))}
        </View>
      ))}
    </View>
  );
}

function History({ q }: { q: ReturnType<typeof useVisitHistory> }) {
  if (q.isLoading) return <SkeletonList count={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  const pages = q.data?.pages ?? [];
  const total = pages.reduce((s, p) => s + p.items.length, 0);
  return (
    <View className="gap-6">
      {pages.map((p) => (
        <View key={p.month} className="gap-3">
          <View className="flex-row items-baseline justify-between">
            <Text variant="h3">{monthLabel(new Date(p.month))}</Text>
            <Text variant="sm" tone="muted">{p.items.length ? `${p.items.length} visit${p.items.length > 1 ? 's' : ''}` : ''}</Text>
          </View>
          {p.items.length ? (
            p.items.map((v, i) => (
              <Entrance key={v.occurrenceId} index={i}>
                <VisitRow v={v} />
              </Entrance>
            ))
          ) : (
            <Text variant="body" tone="muted">No visits this month.</Text>
          )}
        </View>
      ))}
      {!total && !q.hasNextPage ? <EmptyState compact illustration={img('ill-empty-visits.png')} icon="time-outline" title="No past visits" body="Completed visits appear here." /> : null}
      {q.hasNextPage ? <Button title="Load earlier" variant="secondary" icon="chevron-down" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : pages.length ? <Text variant="sm" tone="muted" className="text-center">You have reached the last 12 months.</Text> : null}
    </View>
  );
}
