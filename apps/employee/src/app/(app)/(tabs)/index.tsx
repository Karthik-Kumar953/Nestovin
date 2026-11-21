import { useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BriefcaseBusiness, CalendarOff, ChevronRight, CircleHelp, GraduationCap, ReceiptIndianRupee, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { NotReadyCard } from '../../../components/readiness';
import { NextVisitCard, VisitRow, byStart, pickNext } from '../../../components/visit';
import { greeting, initials, isoDay, longDay, relativeDay, time } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { qk, scheduleWindow, useMe, useOffers, useSchedule } from '../../../lib/queries';
import type { Visit } from '../../../lib/types';
import {
  Avatar,
  EmptyState,
  ErrorState,
  IconButton,
  Label,
  OfflineBanner,
  PressScale,
  ProgressBar,
  Segmented,
  Skeleton,
  Stagger,
  Text,
  c,
  notify,
  shadow,
  useLargeText,
} from '../../../ui';

type Tab = 'today' | 'upcoming' | 'completed';
const DONE = new Set(['COMPLETED', 'COMPLETION_SUBMITTED']);

const SHORTCUTS = [
  { href: '/leave', label: 'Leave', icon: CalendarOff },
  { href: '/training', label: 'Training', icon: GraduationCap },
  { href: '/payslips', label: 'Payslips', icon: ReceiptIndianRupee },
  { href: '/offers', label: 'Extra work', icon: TimerReset },
] as const;

const showHelp = () =>
  notify('Need help?', 'For today’s visits, talk to your supervisor. For your account, password, leave or pay, contact HR.');

/**
 * Today (EMP-05/06/07), direction C: who you are, Today / Upcoming / Completed,
 * "N of M visits done", the next visit with its one action, the rest of the
 * day as compact rows, then any extra-work offer. All from the schedule the
 * app already loads (a week back to two weeks ahead).
 */
export default function Today() {
  const qc = useQueryClient();
  const me = useMe();
  const w = scheduleWindow();
  const schedule = useSchedule(w.from, w.to);
  const offers = useOffers();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const large = useLargeText();

  const today = isoDay();
  const all = schedule.data;
  const visits = useMemo(() => (all ?? []).filter((v) => v.scheduledDate === today).sort(byStart), [all, today]);
  const upcoming = useMemo(() => (all ?? []).filter((v) => v.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || byStart(a, b)), [all, today]);
  const completed = useMemo(
    () => (all ?? []).filter((v) => v.scheduledDate <= today && DONE.has(v.status)).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || byStart(b, a)),
    [all, today],
  );
  const next = pickNext(visits);
  const done = visits.filter((v) => DONE.has(v.status)).length;
  const rest = visits.filter((v) => v.occurrenceId !== next?.occurrenceId);
  const pending = (offers.data ?? []).filter((o) => o.status === 'OPEN' && o.responses.some((r) => r.employeeId === me.data?.id && r.response === 'PENDING'));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([qc.invalidateQueries({ queryKey: qk.me }), qc.invalidateQueries({ queryKey: qk.scheduleAll }), qc.invalidateQueries({ queryKey: qk.offers })]);
    setRefreshing(false);
  };

  const ready = me.data?.readiness === 'READY';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.tealAction} colors={[c.tealAction]} />}
      >
        {/* Header: initials, greeting · Employee ID, name, help */}
        <View className="min-h-[64px] flex-row items-center gap-3 pt-2">
          <PressScale onPress={() => router.push('/profile')} accessibilityLabel="Your profile" accessibilityRole="link">
            {me.data ? <Avatar initials={initials(me.data.fullName)} size={48} /> : <Skeleton className="h-12 w-12 rounded-full" />}
          </PressScale>
          <View className="min-w-0 flex-1">
            <Text className="font-medium text-label text-ink-secondary" accessibilityLabel={me.data ? `${greeting()}. Employee ID ${me.data.employeeCode.split('').join(' ')}` : greeting()}>
              {greeting()}
              {me.data ? ` · ${me.data.employeeCode}` : ''}
            </Text>
            <Text accessibilityRole="header" className="font-display text-headline text-charcoal">
              {me.data?.fullName ?? ' '}
            </Text>
          </View>
          <IconButton icon={CircleHelp} label="Help" onPress={showHelp} />
        </View>

        <OfflineBanner />

        {me.data && !ready ? <NotReadyCard me={me.data} /> : null}

        {ready ? (
          <>
            <Segmented
              label="Visits"
              value={tab}
              onChange={(t) => {
                haptic.select();
                setTab(t);
              }}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'completed', label: 'Completed' },
              ]}
            />

            {schedule.isPending ? (
              <View className="gap-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-[212px] rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </View>
            ) : schedule.error && !all ? (
              <View className="rounded-lg border border-line bg-surface">
                <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
              </View>
            ) : tab === 'today' ? (
              <View className="gap-4">
                {visits.length ? (
                  <View className="gap-2">
                    <View className={`gap-x-3 px-1 ${large ? 'gap-y-0.5' : 'flex-row items-center justify-between'}`}>
                      <Text className="font-medium text-sm text-ink-secondary">{longDay(today)}</Text>
                      <Text className="text-sm text-ink-secondary">
                        <Text className="font-semibold text-sm text-charcoal">
                          {done} of {visits.length}
                        </Text>{' '}
                        visits done
                      </Text>
                    </View>
                    <ProgressBar value={visits.length ? done / visits.length : 0} label={`${done} of ${visits.length} visits done today`} />
                  </View>
                ) : null}

                {next ? (
                  <Stagger index={0}>
                    <NextVisitCard visit={next} />
                  </Stagger>
                ) : (
                  <Stagger index={0}>
                    <View className="rounded-lg border border-line bg-surface" style={shadow.card}>
                      <EmptyState
                        image={visits.length ? 'ill-visit-done' : 'ill-empty-visits'}
                        title={visits.length ? 'All done for today' : 'No visits today'}
                        body={visits.length ? `You finished ${done} of ${visits.length} visits. Thank you.` : upcoming[0] ? `Your next visit is on ${longDay(upcoming[0].scheduledDate)}.` : 'New work appears here when Operations assigns it.'}
                      />
                    </View>
                  </Stagger>
                )}

                {rest.length ? (
                  <View className="gap-2">
                    <Label className="px-1">{next ? 'Also today' : 'Today’s visits'}</Label>
                    {rest.map((v, i) => (
                      <Stagger key={v.occurrenceId} index={i + 1}>
                        <VisitRow visit={v} />
                      </Stagger>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : tab === 'upcoming' ? (
              <DayGroups visits={upcoming} empty={<EmptyState image="ill-empty-visits" title="Nothing scheduled yet" body="Visits for the next two weeks appear here when Operations assigns them." />} />
            ) : completed.length ? (
              <View className="gap-2">
                <Label className="px-1">Last 7 days</Label>
                {completed.map((v, i) => (
                  <Stagger key={v.occurrenceId} index={i}>
                    <VisitRow visit={v} detail={`${relativeDay(v.scheduledDate)} · ${v.flat.communityName}`} />
                  </Stagger>
                ))}
              </View>
            ) : (
              <EmptyState image="ill-visit-done" title="No completed visits yet" body="Visits you complete in the last 7 days appear here." />
            )}
          </>
        ) : null}

        {pending.length ? <OfferCard count={pending.length} first={pending[0]!.visit} /> : null}

        {ready ? (
          <View className="gap-2">
            <Label className="px-1">More</Label>
            <View className="flex-row flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <PressScale key={s.href} containerClassName={large ? 'w-full' : 'grow basis-[46%]'} onPress={() => router.push(s.href)} accessibilityLabel={s.label} accessibilityRole="link">
                  <View className="min-h-[56px] flex-row items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                    <View className="h-9 w-9 items-center justify-center rounded-md bg-mint">
                      <s.icon size={18} color={c.tealDeep} strokeWidth={2} />
                    </View>
                    <Text className="flex-1 font-semibold text-body-sm">{s.label}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          </View>
        ) : null}

        {me.error && !me.data ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Upcoming: one block per day, labelled Tomorrow / Mon 24 Nov. */
function DayGroups({ visits, empty }: { visits: Visit[]; empty: ReactNode }) {
  const days = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) m.set(v.scheduledDate, [...(m.get(v.scheduledDate) ?? []), v]);
    return [...m.entries()];
  }, [visits]);
  if (!days.length) return <>{empty}</>;
  let i = 0;
  return (
    <View className="gap-4">
      {days.map(([day, list]) => (
        <View key={day} className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Label>{relativeDay(day)}</Label>
            <Text className="text-label text-ink-secondary">
              {list.length} {list.length === 1 ? 'visit' : 'visits'}
            </Text>
          </View>
          {list.map((v) => (
            <Stagger key={v.occurrenceId} index={i++}>
              <VisitRow visit={v} />
            </Stagger>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Extra-work offer in a teal tint: what and when for one offer, a count for several. */
function OfferCard({ count, first }: { count: number; first: { scheduledDate: string; startsAt: string | null; flat: { communityName: string } } }) {
  const when = `${relativeDay(first.scheduledDate)}${first.startsAt ? ` ${time(first.startsAt)}` : ''}`;
  const title = count === 1 ? `Extra visit ${when.charAt(0).toLowerCase()}${when.slice(1)}` : `${count} extra work offers`;
  const sub = count === 1 ? `New offer · ${first.flat.communityName}` : 'Waiting for your answer';
  return (
    <PressScale onPress={() => router.push('/offers')} accessibilityLabel={`${title}. ${sub}`} accessibilityHint="Opens extra work offers">
      <View className="min-h-[64px] flex-row items-center gap-3 rounded-lg border border-mint-strong bg-mint-soft py-3 pl-4 pr-3">
        <View className="h-10 w-10 items-center justify-center rounded-md bg-surface">
          <BriefcaseBusiness size={20} color={c.primary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-body-sm text-charcoal">{title}</Text>
          <Text className="text-label text-ink-secondary">{sub}</Text>
        </View>
        <View className="min-h-[48px] flex-row items-center gap-0.5">
          <Text className="font-semibold text-sm text-teal-deep">View</Text>
          <ChevronRight size={18} color={c.tealDeep} />
        </View>
      </View>
    </PressScale>
  );
}
