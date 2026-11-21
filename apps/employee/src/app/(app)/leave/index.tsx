import { View } from 'react-native';
import { router } from 'expo-router';
import { CalendarPlus, MessageSquareText, X } from 'lucide-react-native';
import type { LeaveRequest } from '@nestovin/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../../lib/api';
import { parseDay } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { qk, useCancelLeave, useLeave } from '../../../lib/queries';
import { BrandImage, Button, EmptyState, ErrorState, LoadingList, Muted, Pill, Screen, Stagger, Text, c, confirmAction, notify, shadow, type Tone } from '../../../ui';

const STATUS: Record<LeaveRequest['status'], { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting for approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Not approved', tone: 'error' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const dm = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const wd = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000) + 1;

/** EMP-09: leave requests; HR/Operations decide. Pending requests can be cancelled. */
export default function Leave() {
  const qc = useQueryClient();
  const q = useLeave();
  const cancel = useCancelLeave();
  const confirmCancel = (l: LeaveRequest) =>
    confirmAction({
      title: 'Cancel this leave request?',
      message: `${dm.format(parseDay(l.startDate))} to ${dm.format(parseDay(l.endDate))}`,
      cancelLabel: 'Keep it',
      confirmLabel: 'Cancel request',
      onConfirm: () =>
        cancel.mutate(l.id, {
          onSuccess: () => haptic.success(),
          onError: (e) => {
            haptic.error();
            notify('Could not cancel', errorMessage(e));
          },
        }),
    });

  return (
    <>
      <Screen
        edges={['bottom', 'left', 'right']}
        onRefresh={() => qc.invalidateQueries({ queryKey: qk.leave })}
        footer={<Button title="Request leave" icon={CalendarPlus} onPress={() => router.push('/leave/new')} />}
      >
        <Stagger index={0}>
          <View className="flex-row items-center gap-3 rounded-lg border border-mint-strong bg-mint-soft p-4">
            <BrandImage name="ill-leave" variant="illustration" className="h-14 w-14" iconSize={20} />
            <View className="flex-1 gap-0.5">
              <Text accessibilityRole="header" className="font-heading text-base text-charcoal">Need time off?</Text>
              <Muted className="text-sm">Ask early. HR or Operations approves, and your visits are covered while you are away.</Muted>
            </View>
          </View>
        </Stagger>
        {q.isPending ? (
          <LoadingList rows={3} />
        ) : q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data?.length ? (
          <View className="gap-2">
            {q.data.map((l, i) => {
              const s = STATUS[l.status];
              const n = daysBetween(l.startDate, l.endDate);
              return (
                <Stagger key={l.id} index={i + 1}>
                  <View className="gap-3 rounded-lg border border-line bg-surface p-4" style={shadow.card}>
                    <View className="flex-row items-center gap-3">
                      <View className="w-14 items-center rounded-md border border-line bg-subtle py-1.5">
                        <Text className="font-semibold text-caption text-ink-secondary">{wd.format(parseDay(l.startDate))}</Text>
                        <Text className="font-display text-headline text-charcoal">{Number(l.startDate.slice(8))}</Text>
                      </View>
                      <View className="flex-1 gap-1 border-l border-line pl-3">
                        <Text className="font-semibold text-charcoal">{l.startDate === l.endDate ? dm.format(parseDay(l.startDate)) : `${dm.format(parseDay(l.startDate))} – ${dm.format(parseDay(l.endDate))}`}</Text>
                        <Muted className="text-sm">
                          {n} {n === 1 ? 'day' : 'days'}
                        </Muted>
                        <Pill label={s.label} tone={s.tone} />
                      </View>
                    </View>
                    {l.reason ? <Muted>{l.reason}</Muted> : null}
                    {l.reviewNote ? (
                      <View className="flex-row gap-2 rounded-md bg-subtle p-3">
                        <MessageSquareText size={18} color={c.textSecondary} />
                        <Text className="flex-1 text-body-sm text-ink-secondary">{l.reviewNote}</Text>
                      </View>
                    ) : null}
                    {l.status === 'PENDING' ? <Button title="Cancel request" variant="ghost" size="md" icon={X} busy={cancel.isPending && cancel.variables === l.id} onPress={() => confirmCancel(l)} className="self-start" /> : null}
                  </View>
                </Stagger>
              );
            })}
          </View>
        ) : (
          <EmptyState image="ill-leave" title="No leave requests" body="Your requests and their decisions appear here." />
        )}
      </Screen>
    </>
  );
}
