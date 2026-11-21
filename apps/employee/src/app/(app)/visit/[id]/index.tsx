import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Building2, CalendarDays, CheckCheck, ClipboardList, Clock3, FilePenLine, Hourglass, Repeat, ScanLine, ShieldAlert, TimerReset, UserX } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { servicePhoto } from '../../../../assets/images';
import { ApiError } from '../../../../lib/api';
import { Tasks, isLive, isOpen } from '../../../../components/visit';
import { flatLabel, isoDay, longDay, relativeDay, time, timeWindow } from '../../../../lib/format';
import { qk, useVisit, visitStatus } from '../../../../lib/queries';
import { BrandImage, Card, EmptyState, ErrorState, FloatingAction, ListRow, LoadingList, Muted, Pill, Screen, ServiceIcon, Stagger, Text, c } from '../../../../ui';

const SOURCE: Record<string, { title: string; detail: string }> = {
  STANDING: { title: 'Regular visit', detail: 'Part of your regular schedule' },
  MANUAL: { title: 'Added by Operations', detail: 'A one-time visit for you' },
  REPLACEMENT: { title: 'Cover visit', detail: 'You are covering for another worker' },
  OVERTIME: { title: 'Extra work (confirmed)', detail: 'You accepted this offer' },
};

const CORRECTION: Record<string, { label: string; tone: 'warning' | 'success' | 'error' }> = {
  PENDING: { label: 'Correction waiting for review', tone: 'warning' },
  APPROVED: { label: 'Correction approved', tone: 'success' },
  REJECTED: { label: 'Correction not approved', tone: 'error' },
};

const STEPS = ['Assigned', 'Checked in', 'Completed'] as const;
function stepOf(status: string) {
  if (status === 'COMPLETED' || status === 'COMPLETION_SUBMITTED') return 2;
  if (status === 'IN_PROGRESS') return 1;
  return 0;
}

/** Visit detail (EMP-05): what, where, when, and only the actions allowed now. */
export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useVisit(id);
  const v = q.data;

  if (q.isPending) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        <LoadingList rows={3} />
      </Screen>
    );
  }
  if (!v) {
    return (
      <Screen edges={['bottom', 'left', 'right']}>
        {q.error && !(q.error instanceof ApiError && q.error.status === 404) ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState image="ill-empty-visits" title="Visit not found" body="It may have been moved to another worker. Pull down on Schedule to refresh." />
        )}
      </Screen>
    );
  }

  const s = visitStatus(v.status);
  const today = v.scheduledDate === isoDay();
  const canCheckIn = isOpen(v) && today;
  const live = isLive(v);
  const terminal = ['COMPLETED', 'CANCELLED'].includes(v.status);
  const canAbsent = isOpen(v) && today;
  const canCorrect = !terminal && v.scheduledDate <= isoDay() && v.correction?.status !== 'PENDING';
  const step = stepOf(v.status);
  const off = v.status === 'NO_SHOW' || v.status === 'CANCELLED' || v.status === 'EXCEPTION';

  return (
    <>
      <Stack.Screen options={{ title: relativeDay(v.scheduledDate) }} />
      <Screen edges={['bottom', 'left', 'right']} padded={false} onRefresh={() => Promise.all([qc.invalidateQueries({ queryKey: qk.visit(id) }), qc.invalidateQueries({ queryKey: qk.scheduleAll })])}>
        <View className="px-5">
          <Stagger index={0}>
            <View className="h-44 overflow-hidden rounded-2xl">
              <BrandImage name={servicePhoto(v.serviceName)} className="h-full w-full" iconSize={56} />
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(8,28,25,0.7)']} style={{ position: 'absolute', inset: 0 }} />
              <View className="absolute bottom-4 left-4 right-4 flex-row items-center gap-3">
                <ServiceIcon serviceName={v.serviceName} size="lg" />
                <View className="flex-1">
                  <Text className="font-heading text-2xl text-white">{v.serviceName}</Text>
                  {v.source === 'OVERTIME' || v.isAddon ? <Text className="text-[15px] text-white/90">{v.isAddon ? 'Add-on service' : 'Extra work'}</Text> : null}
                </View>
              </View>
            </View>
          </Stagger>
        </View>

        <View className="gap-4 px-5">
          <Stagger index={1}>
            <View className="gap-2">
              <Pill label={s.label} tone={s.tone} />
              <Text accessibilityRole="header" className="font-display text-[30px] leading-[38px] text-charcoal">
                {flatLabel(v.flat)}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Building2 size={18} color={c.textSecondary} />
                <Muted>{v.flat.communityName}</Muted>
              </View>
            </View>
          </Stagger>

          <Stagger index={2}>
            <Card className="gap-0 py-2">
              <ListRow icon={CalendarDays} title={longDay(v.scheduledDate)} detail={today ? 'Today' : undefined} />
              <ListRow icon={Clock3} title={timeWindow(v.startsAt, v.endsAt)} detail={v.durationMinutes ? `Time window · ${v.durationMinutes} min` : 'Time window'} />
              <ListRow icon={Repeat} title={SOURCE[v.source]?.title ?? 'Assigned visit'} detail={SOURCE[v.source]?.detail} />
            </Card>
          </Stagger>

          {v.tasks.length ? (
            <Stagger index={2}>
              <Card className="gap-3">
                <View className="flex-row items-center gap-2">
                  <ClipboardList size={20} color={c.tealDeep} />
                  <Text className="font-heading text-lg text-charcoal">What the plan covers</Text>
                </View>
                <Tasks tasks={v.tasks} />
              </Card>
            </Stagger>
          ) : null}

          {v.checkIn || v.completedAt || v.noShow || v.correction ? (
            <Stagger index={3}>
              <Card className="gap-0 py-2">
                {v.checkIn ? (
                  <ListRow
                    icon={v.checkIn.flags.length ? ShieldAlert : BadgeCheck}
                    title={`Checked in at ${time(v.checkIn.at)}`}
                    detail={`${v.checkIn.method === 'QR' ? 'QR scan' : '6-digit code'}${v.checkIn.flags.length ? ' · location under review' : ''}`}
                    tint={v.checkIn.flags.length ? c.warningText : c.successText}
                    tileClass={v.checkIn.flags.length ? 'bg-warning-surface' : 'bg-success-surface'}
                  />
                ) : null}
                {v.completedAt ? <ListRow icon={CheckCheck} title={`Completed at ${time(v.completedAt)}`} tint={c.successText} tileClass="bg-success-surface" /> : null}
                {v.noShow ? (
                  <ListRow
                    icon={UserX}
                    title={v.noShow === 'RESIDENT_ABSENT' ? 'Resident not available' : 'Recorded as missed'}
                    detail={v.noShow === 'RESIDENT_ABSENT' ? 'You recorded this' : 'Recorded by Operations'}
                    tint={c.warningText}
                    tileClass="bg-warning-surface"
                  />
                ) : null}
                {v.correction ? (
                  <View className="gap-2 py-3">
                    <View className="flex-row items-center gap-3">
                      <View className="h-11 w-11 items-center justify-center rounded-md bg-mint">
                        <Hourglass size={22} color={c.tealDeep} />
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="font-semibold">{v.correction.requestedChange === 'MARK_ATTENDED' ? 'You asked: mark as attended' : 'You asked: mark as completed'}</Text>
                        <Pill label={CORRECTION[v.correction.status]!.label} tone={CORRECTION[v.correction.status]!.tone} />
                      </View>
                    </View>
                    {v.correction.reviewNote ? <Muted className="pl-[60px]">{v.correction.reviewNote}</Muted> : null}
                  </View>
                ) : null}
              </Card>
            </Stagger>
          ) : null}

          {!off ? (
            <Stagger index={3}>
              <Card className="gap-4">
                <Text className="font-heading text-lg text-charcoal">Progress</Text>
                <View className="flex-row items-center" accessible accessibilityLabel={`Progress: ${STEPS[step]}`}>
                  {STEPS.map((label, i) => (
                    <View key={label} className="flex-1 items-center gap-2">
                      <View className="w-full flex-row items-center">
                        <View className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : i <= step ? 'bg-teal-action' : 'bg-line'}`} />
                        <View className={`h-7 w-7 items-center justify-center rounded-full ${i <= step ? 'bg-teal-action' : 'border-2 border-line bg-surface'}`}>
                          {i <= step ? <CheckCheck size={14} color={c.white} strokeWidth={2.5} /> : null}
                        </View>
                        <View className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : i < step ? 'bg-teal-action' : 'bg-line'}`} />
                      </View>
                      <Text className={`text-center text-sm ${i <= step ? 'font-semibold text-teal-deep' : 'text-ink-secondary'}`}>{label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </Stagger>
          ) : null}

          {isOpen(v) && !today ? (
            <View className="flex-row items-center gap-3 rounded-lg bg-info-surface p-4">
              <TimerReset size={20} color={c.infoText} />
              <Text className="flex-1 text-[15px] text-info-text">You can check in on the day of the visit, with the resident’s code.</Text>
            </View>
          ) : null}

          {canAbsent || canCorrect ? (
            <Stagger index={4}>
              <Card className="gap-0 py-1">
                {canAbsent ? (
                  <ListRow
                    icon={UserX}
                    title="Resident not available"
                    detail="Record this after waiting at the door"
                    tint={c.warningText}
                    tileClass="bg-warning-surface"
                    onPress={() => router.push({ pathname: '/visit/[id]/absent', params: { id: v.occurrenceId } })}
                  />
                ) : null}
                {canCorrect ? (
                  <ListRow
                    icon={FilePenLine}
                    title="Request a correction"
                    detail="If your attendance or completion is wrong"
                    onPress={() => router.push({ pathname: '/visit/[id]/correction', params: { id: v.occurrenceId } })}
                  />
                ) : null}
              </Card>
            </Stagger>
          ) : null}
          <View className="h-20" />
        </View>
      </Screen>
      {canCheckIn ? (
        <FloatingAction label="Check in" icon={ScanLine} hint="Enter or scan the resident's code" onPress={() => router.push({ pathname: '/visit/[id]/check-in', params: { id: v.occurrenceId } })} />
      ) : live ? (
        <FloatingAction label="Complete visit" icon={CheckCheck} onPress={() => router.push({ pathname: '/visit/[id]/complete', params: { id: v.occurrenceId } })} />
      ) : null}
    </>
  );
}
