import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  Entrance,
  Icon,
  PressScale,
  Screen,
  SkeletonList,
  Text,
  colors,
  type IconName,
} from '@nestovin/ui-native';
import { api } from '../../lib/api';
import { hrefForEvent } from '../../lib/deeplinks';
import { relative, sentences, today } from '../../lib/format';
import { keys, useInbox, type Inbox, type InboxItem } from '../../lib/queries';
import { img } from '../../assets/images';
import { ErrorState } from '../../components/common';

const ICON: [string, IconName][] = [
  ['residence.verified', 'shield-checkmark-outline'],
  ['residence.rejected', 'document-text-outline'],
  ['family.', 'people-outline'],
  ['change_request', 'swap-horizontal-outline'],
  ['ticket.', 'chatbubbles-outline'],
  ['payment.', 'card-outline'],
  ['booking.', 'calendar-outline'],
  ['visit.', 'home-outline'],
];
const iconFor = (t: string): IconName =>
  ICON.find(([k]) => t.startsWith(k))?.[1] ?? 'notifications-outline';

/** RES-13: in-app Updates (always delivered, push or not). Each update opens its screen. */
export default function Notifications() {
  const qc = useQueryClient();
  const inbox = useInbox();
  const readAll = useMutation({
    mutationFn: () => api<Inbox>('/v1/resident/notifications/read-all', { method: 'POST' }),
    onSuccess: async (d) => {
      qc.setQueryData(keys.inbox, d);
      await qc.invalidateQueries({ queryKey: keys.inboxCount });
    },
  });
  const open = (n: InboxItem) => {
    if (!n.readAt) {
      void api(`/v1/resident/notifications/${n.id}/read`, { method: 'POST' })
        .then(() => Promise.all([qc.invalidateQueries({ queryKey: keys.inbox })]))
        .catch(() => undefined);
    }
    router.push(hrefForEvent(n.eventType, n.data));
  };
  const items = inbox.data?.items ?? [];
  const t = today();
  const todays = items.filter((n) => n.createdAt.slice(0, 10) === t);
  const earlier = items.filter((n) => n.createdAt.slice(0, 10) !== t);

  return (
    <Screen
      title="Updates"
      onBack={() => router.back()}
      actions={
        inbox.data?.unread ? (
          <Button
            title="Mark all read"
            variant="tertiary"
            size="sm"
            block={false}
            loading={readAll.isPending}
            onPress={() => readAll.mutate()}
          />
        ) : undefined
      }
      onRefresh={() => void inbox.refetch()}
      refreshing={inbox.isRefetching}
    >
      {inbox.isLoading ? <SkeletonList count={4} /> : null}
      {inbox.error ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} compact />
      ) : null}
      {!inbox.isLoading && !inbox.error && !items.length ? (
        <EmptyState
          illustration={img('ill-empty-support.png')}
          icon="notifications-outline"
          title="No updates yet"
          body="Verification results, booking news and replies from support appear here."
        />
      ) : null}
      {[
        ['Today', todays],
        ['Earlier', earlier],
      ].map(([label, list]) =>
        (list as InboxItem[]).length ? (
          <View key={label as string} className="gap-2">
            <Text variant="label" tone="muted" accessibilityRole="header">
              {label as string}
            </Text>
            {(list as InboxItem[]).map((n, i) => (
              <Entrance key={n.id} index={i}>
                <PressScale
                  onPress={() => open(n)}
                  haptic="tap"
                  scaleTo={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={sentences(
                    n.readAt ? null : 'Unread',
                    n.title,
                    n.body,
                    relative(n.createdAt),
                  )}
                  className={`flex-row gap-3 rounded-lg p-4 border ${n.readAt ? 'bg-white border-line' : 'bg-teal-50 border-teal-200'}`}
                >
                  <View
                    className={`h-10 w-10 rounded-md items-center justify-center ${n.readAt ? 'bg-surface-subtle' : 'bg-teal'}`}
                  >
                    <Icon
                      name={iconFor(n.eventType)}
                      size={20}
                      color={n.readAt ? colors.textSecondary : colors.white}
                    />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-start justify-between gap-2">
                      <Text variant="bodyStrong" className="flex-1">
                        {n.title}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {relative(n.createdAt)}
                      </Text>
                    </View>
                    <Text variant="sm" tone="muted">
                      {n.body}
                    </Text>
                  </View>
                  <View className="justify-center">
                    <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />
                  </View>
                </PressScale>
              </Entrance>
            ))}
          </View>
        ) : null,
      )}
    </Screen>
  );
}
