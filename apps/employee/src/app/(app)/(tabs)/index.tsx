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
  OfflineBanner,
  PressScale,
  Rings,
  Skeleton,
  Stagger,
  Text,
  c,
  gradients,
  shadow,
  useLargeText,
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
  const large = useLargeText();

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
            <Text className="font-medium text-body-sm text-white/90">{longDay(today)}</Text>
            <Text accessibilityRole="header" className="font-display text-title text-white">
              {greeting()}
              {me.data ? `, ${firstName(me.data.fullName)}` : ''}
            </Text>
          </View>
          <PressScale onPress={() => router.push('/profile')} accessibilityLabel="Your profile">
            <View className="rounded-full border-2 border-white/40">{me.data ? <Avatar initials={initials(me.data.fullName)} size={48} /> : <View className="h-12 w-12" />}</View>
          </PressScale>
        </View>
        {ready ? (
          <View className={`mt-5 flex-row gap-3 ${large ? 'flex-wrap' : ''}`}>
            <Stat large={large} label="Visits today" value={schedule.data ? String(visits.length) : '–'} />
            <Stat large={large} label="Done" value={schedule.data ? `${done}/${visits.length}` : '–'} />
            <Stat large={large} label="Offers" value={offers.data ? String(pendingOffers) : '–'} />
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
                  <Text className="text-body-sm text-warning-text">
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
                <View className="min-h-[48px] flex-row items-center gap-1.5 px-2">
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
          {/* Wrapping grid: two tiles a row on most phones, one a row on narrow screens or large text. */}
          <View className="flex-row flex-wrap gap-3">
            {SHORTCUTS.map((s, i) => {
              const badge = s.href === '/offers' && pendingOffers ? pendingOffers : 0;
              return (
                <Stagger key={s.href} index={i + 3} style={{ flexGrow: 1, flexBasis: large ? '100%' : 148 }}>
                  <PressScale onPress={() => router.push(s.href)} accessibilityLabel={badge ? `${s.label}, ${badge} waiting` : s.label}>
                    <View className="min-h-[96px] gap-3 rounded-xl border border-line/70 bg-surface p-4" style={shadow.card}>
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="h-11 w-11 items-center justify-center rounded-md bg-mint">
                          <s.icon size={22} color={c.tealDeep} strokeWidth={2} />
                        </View>
                        {badge ? (
                          <View className="min-w-[28px] items-center rounded-full bg-warning-surface px-2 py-1">
                            <Text className="font-semibold text-label text-warning-text">{badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="font-semibold">{s.label}</Text>
                    </View>
                  </PressScale>
                </Stagger>
              );
            })}
          </View>
        </View>
        {me.error && !me.data ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, large }: { label: string; value: string; large: boolean }) {
  return (
    <View className={`rounded-lg bg-white/15 px-3 py-2.5 ${large ? 'min-w-[45%] grow' : 'flex-1'}`} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className="font-heading text-stat text-white">{value}</Text>
      <Text className="text-label text-white/90">{label}</Text>
    </View>
  );
}
