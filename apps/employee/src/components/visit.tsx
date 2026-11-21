import { useEffect, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, CheckCheck, ClipboardList, Clock3, FileText, Navigation, ScanLine, Sun, UserRound } from 'lucide-react-native';
import { ApiError } from '../lib/api';
import { addressLabel, duration, shortAddress, time, timeParts, timeWindow } from '../lib/format';
import { visitStatus } from '../lib/queries';
import type { VisitTask } from '@nestovin/contracts';
import type { Visit, VisitDetail } from '../lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingList, Muted, Screen, Pill, PressScale, Text, c, serviceGlyph, shadow, useLargeText, type Tone } from '../ui';

export const isOpen = (v: Visit) => v.status === 'ASSIGNED' || v.status === 'SCHEDULED';
export const isLive = (v: Visit) => v.status === 'IN_PROGRESS';

/** The visit to act on now: the one in progress, else the next upcoming. */
export function pickNext(visits: Visit[]): Visit | null {
  return visits.find(isLive) ?? visits.find(isOpen) ?? null;
}

export function byStart(a: Visit, b: Visit) {
  return (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9') || a.scheduledDate.localeCompare(b.scheduledDate);
}

const PERIOD: Record<string, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };

/** "Every visit", "Daily", "2× a week": how often the resident's plan covers a task. */
export function taskFrequency(t: VisitTask): string {
  if (t.frequency === 'PER_VISIT') return 'Every visit';
  const period = PERIOD[t.frequency];
  if (!period) return '';
  if (t.timesPerPeriod <= 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly' }[period]!;
  return `${t.timesPerPeriod}× a ${period}`;
}

/**
 * Tasks from the booking's terms snapshot (what the resident agreed to). An
 * empty list means the plan lists none, so only the service is shown.
 */
export function Tasks({ tasks, max }: { tasks: VisitTask[]; max?: number }) {
  if (!tasks.length) return null;
  const shown = max ? tasks.slice(0, max) : tasks;
  const more = tasks.length - shown.length;
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel={`Tasks: ${tasks.map((t) => `${t.name}, ${taskFrequency(t)}`).join('; ')}`}>
      {shown.map((t) => {
        const f = taskFrequency(t);
        return (
          <View key={t.name} className="max-w-full rounded-md bg-subtle px-3 py-1.5">
            {/* One wrapping Text so long names stay inside the card at large text sizes. */}
            <Text className="text-sm text-ink">
              {t.name}
              {f && t.frequency !== 'PER_VISIT' ? <Text className="text-label text-ink-secondary"> · {f}</Text> : null}
            </Text>
          </View>
        );
      })}
      {more > 0 ? (
        <View className="rounded-md bg-subtle px-3 py-1.5">
          <Text className="text-sm text-ink-secondary">+{more} more</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Current time, re-read every 30 s so "Starts in 25 min" stays true while the screen is open. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * The time chip on the next-visit card, derived only from the visit's own
 * start and end times: "Starts in 25 min" (amber inside the hour), "Due now",
 * or "In progress" once checked in.
 */
export function startChip(visit: Visit, now: number): { label: string; tone: Tone } {
  if (isLive(visit)) return { label: 'In progress', tone: 'teal' };
  if (!visit.startsAt) return { label: 'Time to be confirmed', tone: 'neutral' };
  const mins = (new Date(visit.startsAt).getTime() - now) / 60_000;
  if (mins > 60) return { label: `Starts in ${duration(mins)}`, tone: 'neutral' };
  if (mins > 1) return { label: `Starts in ${duration(mins)}`, tone: 'warning' };
  if (visit.endsAt && now > new Date(visit.endsAt).getTime()) return { label: 'Time window passed', tone: 'warning' };
  return { label: 'Due now', tone: 'warning' };
}

/**
 * Next-visit card (direction C): service and "Next visit", the time chip, the
 * address large, community, time window, then Details + the one action that
 * matters now (Check in, or Complete visit once checked in).
 */
export function NextVisitCard({ visit }: { visit: Visit }) {
  const live = isLive(visit);
  const now = useNow();
  const chip = startChip(visit, now);
  const large = useLargeText();
  const Glyph = serviceGlyph(visit.serviceName);
  const open = () => router.push({ pathname: '/visit/[id]', params: { id: visit.occurrenceId } });
  return (
    <Card raised pad="none">
      <PressScale
        onPress={open}
        accessibilityLabel={`${live ? 'Current visit' : 'Next visit'}: ${visit.serviceName}, ${addressLabel(visit.flat)}, ${visit.flat.communityName}, ${timeWindow(visit.startsAt, visit.endsAt)}. ${chip.label}`}
        accessibilityHint="Opens the visit"
      >
        <View className="gap-3 px-4 pt-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <View className="flex-row items-center gap-1.5">
              <Glyph size={16} color={c.tealAction} strokeWidth={2} />
              <Text className="font-semibold text-label text-teal-action">
                {visit.serviceName} · {live ? 'Current visit' : 'Next visit'}
              </Text>
            </View>
            <Pill label={chip.label} tone={chip.tone} icon={live ? undefined : Clock3} />
          </View>
          <View className="gap-0.5">
            <Text accessibilityRole="header" className="font-display text-headline text-charcoal">
              {addressLabel(visit.flat)}
            </Text>
            <Muted className="text-sm">{visit.flat.communityName}</Muted>
          </View>
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
            <View className="flex-row items-center gap-1.5">
              <Clock3 size={16} color={c.textSecondary} />
              <Text className="font-semibold text-sm">{timeWindow(visit.startsAt, visit.endsAt)}</Text>
            </View>
            {visit.residentFirstName ? (
              <View className="flex-row items-center gap-1.5">
                <UserRound size={16} color={c.textSecondary} />
                <Text className="font-semibold text-sm">{visit.residentFirstName}</Text>
              </View>
            ) : null}
            {visit.tasks.length ? (
              <View className="flex-row items-center gap-1.5">
                <ClipboardList size={16} color={c.textSecondary} />
                <Text className="font-semibold text-sm">
                  {visit.tasks.length} {visit.tasks.length === 1 ? 'task' : 'tasks'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </PressScale>
      <View className={`mx-4 mb-4 mt-4 gap-2 border-t border-line pt-4 ${large ? 'flex-col-reverse' : 'flex-row'}`}>
        {visit.communityLocation ? (
          <Button
            title="Directions"
            variant="secondary"
            size="md"
            icon={Navigation}
            onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${visit.communityLocation!.lat},${visit.communityLocation!.lng}`)}
            accessibilityHint={`Opens maps to ${visit.flat.communityName}`}
            className={large ? undefined : 'flex-1'}
          />
        ) : (
          <Button title="Details" variant="secondary" size="md" icon={FileText} onPress={open} className={large ? undefined : 'flex-1'} />
        )}
        {live ? (
          <Button title="Complete visit" size="md" icon={CheckCheck} onPress={() => router.push({ pathname: '/visit/[id]/complete', params: { id: visit.occurrenceId } })} className={large ? undefined : 'flex-[1.5]'} />
        ) : (
          <Button
            title="Check in"
            size="md"
            icon={ScanLine}
            onPress={() => router.push({ pathname: '/visit/[id]/check-in', params: { id: visit.occurrenceId } })}
            accessibilityHint="Enter or scan the resident's code"
            className={large ? undefined : 'flex-[1.5]'}
          />
        )}
      </View>
    </Card>
  );
}

const DONE = new Set(['COMPLETED', 'COMPLETION_SUBMITTED']);

/**
 * Compact visit row (direction C "Also today"): time column, hairline,
 * service and address, then the status chip in words.
 */
export function VisitRow({ visit, detail }: { visit: Visit; detail?: string }) {
  const s = visitStatus(visit.status);
  const done = DONE.has(visit.status);
  const tp = timeParts(visit.startsAt);
  const large = useLargeText();
  // Below 360 dp (or with large text) the chip moves under the address so the text never gets squeezed.
  const { width } = useWindowDimensions();
  const stackChip = large || width < 360;
  const sub = detail ?? visit.flat.communityName;
  const chip = <Pill label={done ? 'Done' : s.label} tone={s.tone} icon={done ? Check : undefined} className={stackChip ? 'mt-1' : undefined} />;
  return (
    <PressScale
      onPress={() => router.push({ pathname: '/visit/[id]', params: { id: visit.occurrenceId } })}
      accessibilityLabel={`${time(visit.startsAt) ?? 'Time to be confirmed'}, ${visit.serviceName}, ${shortAddress(visit.flat)}, ${sub}, ${s.label}`}
      accessibilityHint="Opens the visit"
    >
      <View className={`min-h-[64px] gap-3 rounded-lg border border-line bg-surface px-4 py-3 ${large ? '' : 'flex-row items-center'}`} style={shadow.card}>
        <View className={large ? 'flex-row items-baseline gap-1' : 'w-14'}>
          <Text className={`font-display text-base leading-5 ${done ? 'text-ink-secondary' : 'text-charcoal'}`}>{tp?.hm ?? '—'}</Text>
          <Text className="text-caption text-ink-secondary">{tp?.ap ?? 'TBC'}</Text>
        </View>
        <View className={`min-w-0 flex-1 gap-0.5 self-stretch justify-center ${large ? '' : 'border-l border-line pl-3'}`}>
          <Text className={`font-semibold text-body-sm ${done ? 'text-ink-secondary' : 'text-charcoal'}`}>
            {visit.serviceName} · {shortAddress(visit.flat)}
          </Text>
          <Text className="text-label text-ink-secondary">{sub}</Text>
          {stackChip ? chip : null}
        </View>
        {stackChip ? null : chip}
      </View>
    </PressScale>
  );
}

/**
 * Loading, error and not-found states for the visit action screens (complete,
 * resident not available, correction) while the visit is looked up. Render it
 * when the query has no data yet.
 */
export function VisitLookupState({ query }: { query: UseQueryResult<VisitDetail> }) {
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  return (
    <Screen edges={['bottom', 'left', 'right']}>
      {query.isPending ? (
        <LoadingList rows={3} />
      ) : notFound || !query.error ? (
        <EmptyState
          image="ill-empty-visits"
          title="Visit not found"
          body="It may have been moved to another worker. Go back to Today and pull down to refresh."
          action={<Button title="Back to today" variant="secondary" icon={Sun} onPress={() => router.dismissTo('/(app)/(tabs)')} />}
        />
      ) : (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      )}
    </Screen>
  );
}
