import { View } from 'react-native';
import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Bell, CalendarCheck2, CalendarOff, CheckCheck, FilePenLine, ReceiptIndianRupee, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ago } from '../../../lib/format';
import { linkFor } from '../../../lib/links';
import { qk, useInbox, useMarkRead } from '../../../lib/queries';
import type { InboxItem } from '../../../lib/types';
import { EmptyState, ErrorState, LoadingList, PressScale, Screen, Stagger, Text, c, shadow } from '../../../ui';

const ICONS: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  'overtime.offered': { icon: TimerReset, bg: c.warningSurface, fg: c.warningText },
  'overtime.confirmed': { icon: CalendarCheck2, bg: c.successSurface, fg: c.successText },
  'assignment.standing': { icon: CalendarCheck2, bg: '#E0F2EF', fg: c.tealDeep },
  'assignment.visit': { icon: CalendarCheck2, bg: '#E0F2EF', fg: c.tealDeep },
  'leave.decided': { icon: CalendarOff, bg: c.infoSurface, fg: c.infoText },
  'attendance.correction_decided': { icon: FilePenLine, bg: c.infoSurface, fg: c.infoText },
  'payslip.available': { icon: ReceiptIndianRupee, bg: c.successSurface, fg: c.successText },
};

/** EMP-10 inbox. Every update opens its screen, which loads the current record. */
export default function Updates() {
  const qc = useQueryClient();
  const q = useInbox();
  const read = useMarkRead();
  const open = (n: InboxItem) => {
    if (!n.readAt) read.mutate(n.id);
    router.push(linkFor(n.eventType, n.data));
  };
  const unread = q.data?.unread ?? 0;
  return (
    <Screen title="Updates" subtitle={unread ? `${unread} new` : undefined} onRefresh={() => qc.invalidateQueries({ queryKey: qk.inbox })}>
      {unread ? (
        <PressScale onPress={() => read.mutate('all')} accessibilityLabel="Mark all as read" className="self-end">
          <View className="min-h-[44px] flex-row items-center gap-1.5 px-1">
            <CheckCheck size={18} color={c.tealAction} />
            <Text className="font-semibold text-teal-action">Mark all as read</Text>
          </View>
        </PressScale>
      ) : null}
      {q.isPending ? (
        <LoadingList rows={4} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data?.items.length ? (
        <View className="gap-3">
          {q.data.items.map((n, i) => {
            const k = ICONS[n.eventType] ?? { icon: Bell, bg: c.surfaceSubtle, fg: c.textSecondary };
            return (
              <Stagger key={n.id} index={i}>
                <PressScale onPress={() => open(n)} accessibilityLabel={`${n.readAt ? '' : 'New. '}${n.title}. ${n.body}. ${ago(n.createdAt)}`} accessibilityHint="Opens the related screen">
                  <View className={`flex-row gap-4 rounded-xl border p-4 ${n.readAt ? 'border-line/70 bg-surface' : 'border-teal-action/30 bg-mint-soft'}`} style={n.readAt ? undefined : shadow.card}>
                    <View className="h-11 w-11 items-center justify-center rounded-md" style={{ backgroundColor: k.bg }}>
                      <k.icon size={22} color={k.fg} strokeWidth={2} />
                    </View>
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className={`flex-1 ${n.readAt ? 'font-medium' : 'font-semibold'}`}>{n.title}</Text>
                        {!n.readAt ? <View className="h-2.5 w-2.5 rounded-full bg-teal-action" /> : null}
                      </View>
                      <Text className="text-[15px] leading-[22px] text-ink-secondary">{n.body}</Text>
                      <Text className="pt-1 text-[13px] text-ink-secondary">{ago(n.createdAt)}</Text>
                    </View>
                  </View>
                </PressScale>
              </Stagger>
            );
          })}
        </View>
      ) : (
        <EmptyState image="ill-empty-visits" title="No updates yet" body="New work, leave decisions, extra-work offers and payslips appear here." />
      )}
    </Screen>
  );
}
