import { memo, useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { LucideIcon } from 'lucide-react-native';
import { Bell, CalendarCheck2, CalendarOff, CheckCheck, FilePenLine, ReceiptIndianRupee, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ago } from '../../../lib/format';
import { linkFor } from '../../../lib/links';
import { qk, useInbox, useMarkRead } from '../../../lib/queries';
import type { InboxItem } from '../../../lib/types';
import { EmptyState, ErrorState, LoadingList, Muted, OfflineBanner, PressScale, Text, Title, c, shadow } from '../../../ui';

const ICONS: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  'overtime.offered': { icon: TimerReset, bg: c.warningSurface, fg: c.warningText },
  'overtime.confirmed': { icon: CalendarCheck2, bg: c.successSurface, fg: c.successText },
  'assignment.standing': { icon: CalendarCheck2, bg: '#E0F2EF', fg: c.tealDeep },
  'assignment.visit': { icon: CalendarCheck2, bg: '#E0F2EF', fg: c.tealDeep },
  'leave.decided': { icon: CalendarOff, bg: c.infoSurface, fg: c.infoText },
  'attendance.correction_decided': { icon: FilePenLine, bg: c.infoSurface, fg: c.infoText },
  'payslip.available': { icon: ReceiptIndianRupee, bg: c.successSurface, fg: c.successText },
};
const FALLBACK_ICON = { icon: Bell, bg: c.surfaceSubtle, fg: c.textSecondary };
const unreadStyle = shadow.card;
const listContent = { paddingHorizontal: 20, paddingBottom: 120 };
const keyOf = (n: InboxItem) => n.id;

/** One update. Memoised: the inbox refetches every minute and rows rarely change. */
const UpdateRow = memo(function UpdateRow({ item, onOpen }: { item: InboxItem; onOpen: (n: InboxItem) => void }) {
  const k = ICONS[item.eventType] ?? FALLBACK_ICON;
  const unread = !item.readAt;
  return (
    <View className="pb-3">
      <PressScale onPress={() => onOpen(item)} accessibilityLabel={`${unread ? 'New. ' : ''}${item.title}. ${item.body.replace(/\.$/, '')}. ${ago(item.createdAt)}`} accessibilityHint="Opens the related screen">
        <View className={`flex-row gap-4 rounded-xl border p-4 ${unread ? 'border-teal-action/30 bg-mint-soft' : 'border-line/70 bg-surface'}`} style={unread ? unreadStyle : undefined}>
          <View className="h-11 w-11 items-center justify-center rounded-md" style={{ backgroundColor: k.bg }}>
            <k.icon size={22} color={k.fg} strokeWidth={2} />
          </View>
          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center justify-between gap-2">
              <Text className={`flex-1 ${unread ? 'font-semibold' : 'font-medium'}`}>{item.title}</Text>
              {unread ? <View className="h-2.5 w-2.5 rounded-full bg-teal-action" /> : null}
            </View>
            <Text className="text-[15px] leading-[22px] text-ink-secondary">{item.body}</Text>
            <Text className="pt-1 text-[13px] text-ink-secondary">{ago(item.createdAt)}</Text>
          </View>
        </View>
      </PressScale>
    </View>
  );
});

/** EMP-10 inbox (virtualised). Every update opens its screen, which loads the current record. */
export default function Updates() {
  const qc = useQueryClient();
  const q = useInbox();
  const read = useMarkRead();
  const [refreshing, setRefreshing] = useState(false);
  const { mutate } = read;

  const open = useCallback(
    (n: InboxItem) => {
      if (!n.readAt) mutate(n.id);
      router.push(linkFor(n.eventType, n.data));
    },
    [mutate],
  );
  const renderItem = useCallback<ListRenderItem<InboxItem>>(({ item }) => <UpdateRow item={item} onOpen={open} />, [open]);
  const refresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: qk.inbox });
    setRefreshing(false);
  };
  const unread = q.data?.unread ?? 0;

  const header = (
    <View className="gap-4 pb-4 pt-2">
      <View className="flex-row items-end justify-between">
        <View className="gap-1">
          <Title>Updates</Title>
          {unread ? <Muted>{`${unread} new`}</Muted> : null}
        </View>
        {unread ? (
          <PressScale onPress={() => mutate('all')} accessibilityLabel="Mark all as read">
            <View className="min-h-[44px] flex-row items-center gap-1.5 px-1">
              <CheckCheck size={18} color={c.tealAction} />
              <Text className="font-semibold text-teal-action">Mark all as read</Text>
            </View>
          </PressScale>
        ) : null}
      </View>
      <OfflineBanner />
    </View>
  );

  const empty = q.isPending ? (
    <LoadingList rows={4} />
  ) : q.error && !q.data ? (
    <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  ) : (
    <EmptyState image="ill-empty-visits" title="No updates yet" body="New work, leave decisions, extra-work offers and payslips appear here." />
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <FlashList
        data={q.data?.items ?? []}
        renderItem={renderItem}
        keyExtractor={keyOf}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.tealAction} colors={[c.tealAction]} />}
      />
    </SafeAreaView>
  );
}
