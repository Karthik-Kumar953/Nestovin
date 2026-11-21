import { memo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ResidentVisit } from '@nestovin/contracts';
import { Icon, PressScale, StatusChip, Text, colors } from '@nestovin/ui-native';
import { dayOfMonth, time, weekday } from '../lib/format';
import { visitStatus } from '../lib/status';
import { serviceIcon } from '../assets/images';

/** A visit as a row: calendar tile, service and time, worker, status. Opens the visit. */
export const VisitRow = memo(function VisitRow({
  v,
  highlight = false,
}: {
  v: ResidentVisit;
  highlight?: boolean;
}) {
  const st = visitStatus(v.status, v.noShow);
  const at = v.startsAt ? time(v.startsAt) : null;
  return (
    <PressScale
      onPress={() => router.push({ pathname: '/visit/[id]', params: { id: v.occurrenceId } })}
      haptic="tap"
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${v.serviceName}, ${weekday(v.scheduledDate)} ${dayOfMonth(v.scheduledDate)}${at ? ` at ${at}` : ''}${v.workerName ? `, ${v.workerName}` : ''}, ${st.label}`}
      className={`flex-row items-center gap-4 rounded-xl p-4 border ${highlight ? 'bg-teal-50 border-teal-200' : 'bg-white border-line/70'}`}
    >
      <View
        className={`w-[52px] items-center rounded-lg py-2 ${highlight ? 'bg-teal' : 'bg-teal-100'}`}
      >
        <Text
          variant="caption"
          tone={highlight ? 'inverse' : 'brand'}
          className="font-semibold uppercase"
        >
          {weekday(v.scheduledDate)}
        </Text>
        <Text
          variant="h3"
          tone={highlight ? 'inverse' : 'default'}
          className={highlight ? '' : 'text-charcoal'}
        >
          {dayOfMonth(v.scheduledDate)}
        </Text>
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon name={serviceIcon(v.serviceName)} size={16} color={colors.tealDeep} />
          <Text variant="bodyStrong" numberOfLines={1} className="flex-shrink">
            {v.serviceName}
            {at ? ` · ${at}` : ''}
          </Text>
        </View>
        <Text variant="sm" tone="muted" numberOfLines={1}>
          {v.workerName ? `${v.workerName} assigned` : 'Worker to be assigned'}
        </Text>
        <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
      </View>
      <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />
    </PressScale>
  );
});
