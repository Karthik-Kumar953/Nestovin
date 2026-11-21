import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Send } from 'lucide-react-native';
import { errorMessage } from '../../../lib/api';
import { isoDay, longDay, parseDay } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { useRequestLeave } from '../../../lib/queries';
import { Banner, Button, Field, Muted, RangeCalendar, Screen, Text } from '../../../ui';

/** EMP-09 new request: dates (start today or later) and an optional reason. */
export default function NewLeave() {
  const m = useRequestLeave();
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const last = end ?? start;
  const days = start && last ? Math.round((parseDay(last).getTime() - parseDay(start).getTime()) / 86_400_000) + 1 : 0;

  const submit = () => {
    if (!start) return;
    m.mutate(
      { startDate: start, endDate: last ?? start, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        onSuccess: () => {
          haptic.success();
          router.back();
        },
        onError: () => haptic.error(),
      },
    );
  };

  return (
    <Screen
      edges={['bottom', 'left', 'right']}
      footer={<Button title={days ? `Send request for ${days} ${days === 1 ? 'day' : 'days'}` : 'Choose your dates'} icon={Send} disabled={!start} busy={m.isPending} onPress={submit} />}
    >
      <Muted>Tap the first day, then the last day. For one day, tap it once.</Muted>
      <RangeCalendar start={start} end={end} min={isoDay()} onChange={(s, e) => { setStart(s); setEnd(e); }} />
      {start ? (
        <View className="rounded-lg bg-mint p-4" accessibilityLiveRegion="polite">
          <Text className="font-semibold text-teal-deep">{start === last ? longDay(start) : `${longDay(start)} to ${longDay(last!)}`}</Text>
        </View>
      ) : null}
      <Field label="Reason" optional multiline value={reason} onChangeText={setReason} maxLength={500} placeholder="For example: family function in my village" />
      {m.error ? <Banner tone="error">{errorMessage(m.error)}</Banner> : null}
    </Screen>
  );
}
