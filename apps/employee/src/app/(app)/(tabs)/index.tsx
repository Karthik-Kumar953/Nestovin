import { useMemo, useState } from 'react';
import { ScrollView, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, CalendarOff, ChevronRight, GraduationCap, ReceiptIndianRupee, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { NotReadyCard } from '../../../components/readiness';
import { NextVisitCard, TimelineRow, byStart, pickNext } from '../../../components/visit';
import { firstName, greeting, initials, isoDay, longDay } from '../../../lib/format';
import { qk, scheduleWindow, useMe, useOffers, useSchedule } from '../../../lib/queries';
import {
  Avatar,
  BrandImage,
  EmptyState,
  ErrorState,
  Heading,
  Muted,
  OfflineBanner,
  PressScale,
  Rings,
  Skeleton,
  Stagger,
  Text,
  c,
  gradients,
  shadow,
} from '../../../ui';

const SHORTCUTS = [
  { href: '/offers', label: 'Extra work', icon: TimerReset },
  { href: '/leave', label: 'Leave', icon: CalendarOff },
  { href: '/training', label: 'Training', icon: GraduationCap },
  { href: '/payslips', label: 'Payslips', icon: ReceiptIndianRupee },
] as const;

/** Today (EMP-05/06/07): next visit as the hero, then the day's timeline. */
export default function Today() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe();
  const w = scheduleWindow();
  const schedule = useSchedule(w.from, w.to);
  const offers = useOffers();
  const [refreshing, setRefreshing] = useState(false);

  const today = isoDay();
  const visits = useMemo(() => (schedule.data ?? []).filter((v) => v.scheduledDate === today).sort(byStart), [schedule.data, today]);
  const next = pickNext(visits);
  const done = visits.filter((v) => v.status === 'COMPLETED' || v.status === 'COMPLETION_SUBMITTED').length;
  const pendingOffers = (offers.data ?? []).filter((o) => o.status === 'OPEN' && o.responses.some((r) => r.employeeId === me.data?.id && r.response === 'PENDING')).length;
  const tomorrow = useMemo(() => (schedule.data ?? []).filter((v) => v.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || byStart(a, b))[0], [schedule.data, today]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([qc.invalidateQueries({ queryKey: qk.me }), qc.invalidateQueries({ queryKey: qk.scheduleAll }), qc.invalidateQueries({ queryKey: qk.offers })]);
    setRefreshing(false);
  };

  const ready = me.data?.readiness === 'READY';

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.white} colors={[c.tealAction]} progressViewOffset={insets.top} />}
    >
      {/* Hero header */}
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 12, paddingBottom: 88, paddingHorizontal: 20 }}>
        <View className="absolute -right-24 -top-10" pointerEvents="none">
          <Rings opacity={0.1} size={340} />
        </View>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-1">
            <Text className="font-medium text-[15px] text-white/85">{longDay(today)}</Text>
            <Text accessibilityRole="header" className="font-display text-[30px] leading-[38px] text-white">
              {greeting()}
              {me.data ? `, ${firstName(me.data.fullName)}` : ''}
            </Text>
          </View>
          <PressScale onPress={() => router.push('/profile')} accessibilityLabel="Your profile">
            <View className="rounded-full border-2 border-white/40">{me.data ? <Avatar initials={initials(me.data.fullName)} size={48} /> : <View className="h-12 w-12" />}</View>
          </PressScale>
        </View>
        {ready ? (
          <View className="mt-5 flex-row gap-3">
            <Stat label="Visits today" value={schedule.data ? String(visits.length) : '–'} />
            <Stat label="Completed" value={schedule.data ? `${done}/${visits.length}` : '–'} />
            <Stat label="Offers" value={offers.data ? String(pendingOffers) : '–'} />
          </View>
        ) : null}
      </LinearGradient>

      <View className="-mt-16 gap-6 px-5">
        <OfflineBanner />
        {me.data && !ready ? <NotReadyCard me={me.data} /> : null}

        {ready ? (
          schedule.isPending ? (
            <Skeleton className="h-[380px] rounded-2xl" />
          ) : schedule.error && !schedule.data ? (
            <View className="rounded-2xl bg-surface" style={shadow.card}>
              <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
            </View>
          ) : next ? (
            <Stagger index={0}>
              <NextVisitCard visit={next} />
            </Stagger>
          ) : (
            <Stagger index={0}>
              <View className="overflow-hidden rounded-2xl bg-surface" style={shadow.card}>
                <EmptyState
                  image={visits.length ? 'ill-visit-done' : 'ill-empty-visits'}
                  title={visits.length ? 'All done for today' : 'No visits today'}
                  body={visits.length ? `You finished ${done} of ${visits.length} visits. Thank you.` : tomorrow ? `Your next visit is on ${longDay(tomorrow.scheduledDate)}.` : 'New work appears here when Operations assigns it.'}
                />
              </View>
            </Stagger>
          )
        ) : null}

        {pendingOffers > 0 ? (
          <Stagger index={1}>
            <PressScale onPress={() => router.push('/offers')} accessibilityLabel={`${pendingOffers} extra work ${pendingOffers === 1 ? 'offer' : 'offers'} waiting for your answer`}>
              <View className="flex-row items-center gap-4 rounded-xl border border-warning/40 bg-warning-surface p-4">
                <BrandImage name="ill-overtime" variant="illustration" className="h-14 w-14" iconSize={20} />
                <View className="flex-1">
                  <Text className="font-semibold text-warning-text">Extra work offered</Text>
                  <Text className="text-[15px] text-warning-text">
                    {pendingOffers} {pendingOffers === 1 ? 'offer is' : 'offers are'} waiting for your answer
                  </Text>
                </View>
                <ChevronRight size={22} color={c.warningText} />
              </View>
            </PressScale>
          </Stagger>
        ) : null}

        {ready && visits.length > 0 ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Heading>Today’s visits</Heading>
              <PressScale onPress={() => router.push('/schedule')} accessibilityLabel="Open the week schedule" accessibilityRole="link">
                <View className="min-h-[44px] flex-row items-center gap-1 px-1">
                  <CalendarDays size={18} color={c.tealAction} />
                  <Text className="font-semibold text-teal-action">Week</Text>
                </View>
              </PressScale>
            </View>
            <View>
              {visits.map((v, i) => (
                <Stagger key={v.occurrenceId} index={i + 2}>
                  <TimelineRow visit={v} last={i === visits.length - 1} highlight={v.occurrenceId === next?.occurrenceId} />
                </Stagger>
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <Heading>Quick links</Heading>
          <View className="flex-row flex-wrap gap-3">
            {SHORTCUTS.map((s, i) => (
              <Stagger key={s.href} index={i + 3} style={{ width: '47.5%' }}>
                <PressScale onPress={() => router.push(s.href)} accessibilityLabel={s.label}>
                  <View className="min-h-[84px] justify-between gap-3 rounded-xl border border-line/70 bg-surface p-4" style={shadow.card}>
                    <View className="h-10 w-10 items-center justify-center rounded-md bg-mint">
                      <s.icon size={22} color={c.tealDeep} strokeWidth={2} />
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold">{s.label}</Text>
                      {s.href === '/offers' && pendingOffers ? (
                        <View className="min-w-[24px] items-center rounded-full bg-warning px-1.5 py-0.5">
                          <Text className="font-semibold text-[13px] text-charcoal">{pendingOffers}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </PressScale>
              </Stagger>
            ))}
          </View>
        </View>
        {me.error && !me.data ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}
        {!ready && !me.data && !me.error ? <Muted>Loading…</Muted> : null}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-lg bg-white/15 px-3 py-2.5" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className="font-heading text-[22px] text-white">{value}</Text>
      <Text className="text-[13px] text-white/85">{label}</Text>
    </View>
  );
}
