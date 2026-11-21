import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCheck, Sun } from 'lucide-react-native';
import { VisitLookupState } from '../../../../components/visit';
import { errorMessage } from '../../../../lib/api';
import { flatLabel } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { useVisit, useVisitAction } from '../../../../lib/queries';
import { Banner, Button, Field, Muted, ResultMark, Screen, Stagger, Text } from '../../../../ui';

/** EMP-07: record completion with an optional note. Resident confirmation is OPEN, so it is recorded directly. */
export default function Complete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useVisit(id);
  const visit = query.data;
  const m = useVisitAction<{ note?: string }>(id, 'complete');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    try {
      await m.mutateAsync(note.trim() ? { note: note.trim() } : {});
      haptic.success();
      setDone(true);
    } catch {
      haptic.error();
    }
  };

  if (done) {
    return (
      <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Back to today" icon={Sun} onPress={() => router.dismissTo('/(app)/(tabs)')} />}>
        <View className="items-center pt-8">
          <ResultMark tone="success" />
        </View>
        <Stagger index={2}>
          <View className="items-center gap-2" accessibilityLiveRegion="assertive">
            <Text accessibilityRole="header" className="text-center font-display text-title text-charcoal">
              Visit completed
            </Text>
            <Muted className="text-center">{visit ? `${visit.serviceName} at ${flatLabel(visit.flat)} is marked complete. Thank you.` : 'Thank you.'}</Muted>
          </View>
        </Stagger>
      </Screen>
    );
  }

  if (!visit) return <VisitLookupState query={query} />;

  return (
    <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Mark visit complete" icon={CheckCheck} busy={m.isPending} onPress={() => void submit()} />}>
      <View className="gap-1">
        <Text className="font-display text-headline text-charcoal">Finished the work?</Text>
        <Muted>{`${visit.serviceName} · ${flatLabel(visit.flat)}`}</Muted>
      </View>
      <Field label="Note for Operations" optional multiline value={note} onChangeText={setNote} maxLength={1000} placeholder="For example: the resident asked to skip the balcony today" hint="Only Nestovin staff see this note" />
      {m.error ? <Banner tone="error">{errorMessage(m.error)}</Banner> : null}
    </Screen>
  );
}
