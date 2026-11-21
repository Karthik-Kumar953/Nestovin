import { View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Building2, CheckCheck, ChevronRight, Clock3, ScanLine } from 'lucide-react-native';
import { servicePhoto } from '../assets/images';
import { flatLabel, time, timeWindow } from '../lib/format';
import { visitStatus } from '../lib/queries';
import type { Visit } from '../lib/types';
import { BrandImage, Button, Muted, Pill, PressScale, PulseDot, ServiceIcon, Text, c, shadow, toneColors } from '../ui';

export const isOpen = (v: Visit) => v.status === 'ASSIGNED' || v.status === 'SCHEDULED';
export const isLive = (v: Visit) => v.status === 'IN_PROGRESS';

/** The visit to act on now: the one in progress, else the next upcoming. */
export function pickNext(visits: Visit[]): Visit | null {
  return visits.find(isLive) ?? visits.find(isOpen) ?? null;
}

export function byStart(a: Visit, b: Visit) {
  return (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9') || a.scheduledDate.localeCompare(b.scheduledDate);
}

/** Task chips only when the API sends them (TODO(api)); never invented. */
function Tasks({ tasks }: { tasks?: string[] | null }) {
  if (!tasks?.length) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {tasks.map((t) => (
        <View key={t} className="rounded-full bg-subtle px-3 py-1.5">
          <Text className="text-sm text-ink-secondary">{t}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Hero card on Today: service photo, flat in large type, time window, status
 * and the one action that matters now (check in, or complete).
 */
export function NextVisitCard({ visit }: { visit: Visit }) {
  const live = isLive(visit);
  const s = visitStatus(visit.status);
  const open = () => router.push({ pathname: '/visit/[id]', params: { id: visit.occurrenceId } });
  return (
    <View className="overflow-hidden rounded-2xl bg-surface" style={shadow.float}>
      <PressScale onPress={open} accessibilityLabel={`${live ? 'Current visit' : 'Next visit'}: ${visit.serviceName}, ${flatLabel(visit.flat)}, ${timeWindow(visit.startsAt, visit.endsAt)}`} accessibilityHint="Opens the visit">
        <View className="h-36">
          <BrandImage name={servicePhoto(visit.serviceName)} className="h-full w-full" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(8,28,25,0.72)']} style={{ position: 'absolute', inset: 0 }} />
          <View className="absolute left-4 right-4 top-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5">
              {live ? <PulseDot size={7} /> : <Clock3 size={14} color={c.tealDeep} strokeWidth={2.25} />}
              <Text className="font-semibold text-[13px] text-teal-deep">{live ? 'In progress' : 'Next visit'}</Text>
            </View>
          </View>
          <View className="absolute bottom-3 left-4 right-4 flex-row items-end justify-between">
            <View className="flex-row items-center gap-3">
              <ServiceIcon serviceName={visit.serviceName} />
              <Text className="font-heading text-[22px] text-white">{visit.serviceName}</Text>
            </View>
          </View>
        </View>
        <View className="gap-3 px-5 pt-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="font-display text-[26px] leading-8 text-charcoal">{flatLabel(visit.flat)}</Text>
              <View className="flex-row items-center gap-1.5">
                <Building2 size={16} color={c.textSecondary} />
                <Muted>{visit.flat.communityName}</Muted>
              </View>
            </View>
            <ChevronRight size={22} color={c.textSecondary} />
          </View>
          <View className="flex-row items-center gap-3 rounded-lg bg-mint px-4 py-3">
            <Clock3 size={22} color={c.tealDeep} strokeWidth={2} />
            <Text className="flex-1 font-heading text-xl text-teal-deep">{timeWindow(visit.startsAt, visit.endsAt)}</Text>
            <Pill label={s.label} tone={s.tone} />
          </View>
          <Tasks tasks={visit.tasks} />
        </View>
      </PressScale>
      <View className="p-5 pt-4">
        {live ? (
          <Button title="Complete visit" icon={CheckCheck} onPress={() => router.push({ pathname: '/visit/[id]/complete', params: { id: visit.occurrenceId } })} />
        ) : (
          <Button title="Check in" icon={ScanLine} onPress={() => router.push({ pathname: '/visit/[id]/check-in', params: { id: visit.occurrenceId } })} accessibilityHint="Enter or scan the resident's code" />
        )}
      </View>
    </View>
  );
}

/** One row of the day's timeline: time rail, dot, compact card. */
export function TimelineRow({ visit, last, highlight }: { visit: Visit; last: boolean; highlight?: boolean }) {
  const s = visitStatus(visit.status);
  const t = toneColors[s.tone];
  const done = visit.status === 'COMPLETED' || visit.status === 'COMPLETION_SUBMITTED';
  return (
    <View className="flex-row gap-3">
      <View className="w-[68px] items-end pt-4">
        <Text className={`font-semibold text-[15px] ${done ? 'text-ink-secondary' : 'text-charcoal'}`}>{time(visit.startsAt) ?? '—'}</Text>
      </View>
      <View className="items-center">
        <View className="mt-[18px] h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: highlight ? c.tealAction : t.bg, borderWidth: 2, borderColor: highlight ? c.mintStrong : t.dot }}>
          {done ? <BadgeCheck size={10} color={t.fg} /> : null}
        </View>
        {!last ? <View className="w-0.5 flex-1 bg-line" /> : null}
      </View>
      <PressScale
        className="mb-3 flex-1"
        onPress={() => router.push({ pathname: '/visit/[id]', params: { id: visit.occurrenceId } })}
        accessibilityLabel={`${time(visit.startsAt) ?? 'Time to be confirmed'}, ${visit.serviceName}, ${flatLabel(visit.flat)}, ${s.label}`}
      >
        <View className={`flex-row items-center gap-3 rounded-xl border bg-surface p-3.5 ${highlight ? 'border-teal-action/50' : 'border-line/70'}`}>
          <ServiceIcon serviceName={visit.serviceName} size="sm" />
          <View className="flex-1 gap-0.5">
            <Text className={`font-semibold ${done ? 'text-ink-secondary' : ''}`}>{flatLabel(visit.flat)}</Text>
            <Muted className="text-sm">{visit.serviceName}</Muted>
          </View>
          <Pill label={s.label} tone={s.tone} />
        </View>
      </PressScale>
    </View>
  );
}
