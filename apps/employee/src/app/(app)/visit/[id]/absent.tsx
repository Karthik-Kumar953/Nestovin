import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DoorClosed, Sun, UserX } from 'lucide-react-native';
import { VisitLookupState } from '../../../../components/visit';
import { errorMessage } from '../../../../lib/api';
import { flatLabel, timeWindow } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { oneShotLocation } from '../../../../lib/location';
import { useVisit, useVisitAction } from '../../../../lib/queries';
import { Banner, Button, Field, Muted, ResultMark, Screen, Stagger, Text, c } from '../../../../ui';

/**
 * Resident no-show (ADR-016): recorded by the worker after the confirmed
 * waiting time. The API enforces the wait and says how long when it is early.
 */
export default function ResidentAbsent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useVisit(id);
  const visit = query.data;
  const m = useVisitAction<{ note?: string; lat?: number; lng?: number }>(id, 'resident-absent');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    const fix = await oneShotLocation(6_000);
    try {
      await m.mutateAsync({ ...(note.trim() ? { note: note.trim() } : {}), ...(fix.status === 'ok' ? { lat: fix.lat, lng: fix.lng } : {}) });
      haptic.success();
      setDone(true);
    } catch {
      haptic.error();
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Back to today" icon={Sun} onPress={() => router.dismissTo('/(app)/(tabs)')} />}>
        <View className="items-center pt-8">
          <ResultMark tone="warning" />
        </View>
        <Stagger index={2}>
          <View className="items-center gap-2" accessibilityLiveRegion="assertive">
            <Text accessibilityRole="header" className="text-center font-display text-title text-charcoal">
              Recorded
            </Text>
            <Muted className="text-center">We noted that the resident was not available. You can go to your next visit.</Muted>
          </View>
        </Stagger>
      </Screen>
    );
  }

  if (!visit) return <VisitLookupState query={query} />;

  return (
    <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Record resident not available" variant="danger" icon={UserX} busy={busy} onPress={() => void submit()} />}>
      <View className="flex-row items-center gap-4 rounded-xl bg-warning-surface p-4">
        <DoorClosed size={28} color={c.warningText} />
        <View className="flex-1">
          <Text className="font-semibold text-warning-text">Nobody answered the door?</Text>
          <Text className="text-body-sm text-warning-text">Wait at the door for the agreed time after the visit starts, and try calling the resident first.</Text>
        </View>
      </View>
      <View className="gap-0.5">
        <Text className="font-semibold">{flatLabel(visit.flat)}</Text>
        <Muted>
          {visit.serviceName} · {timeWindow(visit.startsAt, visit.endsAt)}
        </Muted>
      </View>
      <Field label="What happened" optional multiline value={note} onChangeText={setNote} maxLength={500} placeholder="For example: rang twice and waited; security said they are travelling" />
      <Muted className="text-sm">Your location is recorded once with this report.</Muted>
      {m.error ? <Banner tone="error">{errorMessage(m.error)}</Banner> : null}
    </Screen>
  );
}
