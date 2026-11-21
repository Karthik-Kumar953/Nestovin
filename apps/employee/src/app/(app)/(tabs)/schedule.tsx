import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { TimelineRow, byStart } from '../../../components/visit';
import { addDays, daysLabel, isoDay, longDay, parseDay, weekStart } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { qk, useMe, useSchedule } from '../../../lib/queries';
import { Card, EmptyState, GRID_MAX_FONT_SCALE, ErrorState, IconButton, LoadingList, Muted, Screen, Section, Stagger, Text, c } from '../../../ui';

const wd = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const range = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** EMP-05: week view. Routine assignments need no accept/reject. */
export default function Schedule() {
  const qc = useQueryClient();
  const me = useMe();
  const today = isoDay();
  const [week, setWeek] = useState(() => weekStart(today));
  const [day, setDay] = useState(today);
  const end = addDays(week, 6);
  const q = useSchedule(week, end);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of q.data ?? []) m.set(v.scheduledDate, (m.get(v.scheduledDate) ?? 0) + 1);
    return m;
  }, [q.data]);
  const visits = useMemo(() => (q.data ?? []).filter((v) => v.scheduledDate === day).sort(byStart), [q.data, day]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  const moveWeek = (n: number) => {
    haptic.select();
    const w = addDays(week, n * 7);
    setWeek(w);
    setDay(w <= today && today <= addDays(w, 6) ? today : w);
  };

  return (
    <Screen title="Schedule" onRefresh={() => qc.invalidateQueries({ queryKey: qk.scheduleAll })}>
      <View className="flex-row items-center gap-2">
        <IconButton icon={ChevronLeft} label="Previous week" onPress={() => moveWeek(-1)} />
        <Text accessibilityRole="header" className="flex-1 text-center font-semibold text-[17px]">{`${range.format(parseDay(week))} – ${range.format(parseDay(end))}`}</Text>
        <IconButton icon={ChevronRight} label="Next week" onPress={() => moveWeek(1)} />
      </View>
      <View className="flex-row gap-1" accessibilityRole="tablist">
          {days.map((d) => {
            const on = d === day;
            const count = byDay.get(d) ?? 0;
            return (
              <Pressable
                key={d}
                onPress={() => {
                  haptic.select();
                  setDay(d);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${longDay(d)}, ${count} ${count === 1 ? 'visit' : 'visits'}`}
                className={`min-h-[72px] flex-1 items-center justify-center gap-1 rounded-lg ${on ? 'bg-teal-action' : d === today ? 'border-[1.5px] border-teal-action/50 bg-surface' : 'bg-surface'}`}
              >
                <Text maxFontSizeMultiplier={GRID_MAX_FONT_SCALE} className={`text-[12px] ${on ? 'font-semibold text-white/90' : 'text-ink-secondary'}`}>{wd.format(parseDay(d))}</Text>
                <Text maxFontSizeMultiplier={GRID_MAX_FONT_SCALE} className={`font-heading text-lg ${on ? 'text-white' : 'text-charcoal'}`}>{Number(d.slice(8))}</Text>
                <View className="h-1.5 flex-row gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <View key={i} className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-teal-action'}`} />
                  ))}
                </View>
              </Pressable>
            );
          })}
      </View>

      <Section title={day === today ? 'Today' : longDay(day)}>
        {q.isPending ? (
          <LoadingList rows={3} />
        ) : q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : visits.length ? (
          <View>
            {visits.map((v, i) => (
              <Stagger key={v.occurrenceId} index={i}>
                <TimelineRow visit={v} last={i === visits.length - 1} />
              </Stagger>
            ))}
          </View>
        ) : (
          <EmptyState image="ill-empty-visits" title="No visits this day" body={day < today ? 'Nothing was scheduled for you.' : 'If work is assigned, it appears here and you get an update.'} />
        )}
      </Section>

      {me.data?.availability.length ? (
        <Section title="Your working hours">
          <Card className="gap-2">
            {me.data.availability.map((a, i) => (
              <View key={i} className="min-h-[44px] flex-row items-center gap-3">
                <Clock3 size={20} color={c.tealDeep} />
                <Text className="flex-1 font-medium">{daysLabel(a.daysOfWeek)}</Text>
                <Text className="text-ink-secondary">
                  {a.startTime} – {a.endTime}
                </Text>
              </View>
            ))}
            <Muted className="text-sm">Set by HR. To change them, talk to your supervisor.</Muted>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
