import { View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  Card,
  EmptyState,
  Entrance,
  Icon,
  Screen,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { useTickets } from '../../../lib/queries';
import { relative } from '../../../lib/format';
import { ticketStatus } from '../../../lib/status';
import { img } from '../../../assets/images';
import { ErrorState, OfflineNotice } from '../../../components/common';

/** RES-12: household support requests (family members see them too). */
export default function Support() {
  const tickets = useTickets();
  const list = tickets.data ?? [];
  const open = list.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status));
  const closed = list.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));

  return (
    <Screen
      title="Support"
      subtitle="We usually reply within a working day."
      onRefresh={() => void tickets.refetch()}
      refreshing={tickets.isRefetching}
    >
      <OfflineNotice />
      {tickets.isLoading ? <SkeletonList count={3} /> : null}
      {tickets.error ? (
        <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} compact />
      ) : null}
      {!tickets.isLoading && !tickets.error && !list.length ? (
        <EmptyState
          illustration={img('ill-empty-support.png')}
          icon="chatbubbles-outline"
          title="No requests yet"
          body="Something not right with a visit, a payment or your flat? Tell us and we will sort it out. Your household can see requests too."
        >
          <Button title="New request" icon="add" onPress={() => router.push('/ticket/new')} />
        </EmptyState>
      ) : null}
      {list.length ? (
        <Button title="New request" icon="add" onPress={() => router.push('/ticket/new')} />
      ) : null}
      {open.length ? <Section title="Open" items={open} offset={0} /> : null}
      {closed.length ? <Section title="Closed" items={closed} offset={open.length} /> : null}
    </Screen>
  );
}

function Section({
  title,
  items,
  offset,
}: {
  title: string;
  items: NonNullable<ReturnType<typeof useTickets>['data']>;
  offset: number;
}) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {items.map((t, i) => {
        const st = ticketStatus(t.status);
        return (
          <Entrance key={t.id} index={offset + i}>
            <Card
              onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: t.id } })}
              accessibilityLabel={`${t.subject}, ${st.label}, ${t.categoryName}`}
            >
              <View className="flex-row items-start gap-3">
                <View className="h-10 w-10 rounded-full bg-teal-100 items-center justify-center">
                  <Icon name="chatbubble-ellipses-outline" size={20} color={colors.tealDeep} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {t.subject}
                  </Text>
                  <Text
                    variant="sm"
                    tone="muted"
                  >{`${t.reference} · ${t.categoryName} · ${relative(t.createdAt)}`}</Text>
                </View>
              </View>
              <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
            </Card>
          </Entrance>
        );
      })}
    </View>
  );
}
