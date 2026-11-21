import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardCheck, Send, UserCheck } from 'lucide-react-native';
import { ApiError, errorMessage } from '../../../../lib/api';
import { flatLabel, longDay } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { useVisit, useVisitAction } from '../../../../lib/queries';
import { Banner, Button, Field, Muted, PressScale, ResultMark, Screen, Stagger, Text, c } from '../../../../ui';

type Change = 'MARK_ATTENDED' | 'MARK_COMPLETED';
const OPTIONS: { value: Change; title: string; detail: string; icon: typeof UserCheck }[] = [
  { value: 'MARK_ATTENDED', title: 'I was there', detail: 'Check-in did not work or was rejected', icon: UserCheck },
  { value: 'MARK_COMPLETED', title: 'I finished the work', detail: 'The visit is not shown as completed', icon: ClipboardCheck },
];

/** ADM-12A: the worker explains; Operations decides. The original evidence is never edited. */
export default function Correction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useVisit(id).data;
  const m = useVisitAction<{ requestedChange: Change; explanation: string }>(id, 'corrections');
  const [change, setChange] = useState<Change | null>(null);
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!change) return;
    if (text.trim().length < 5) return setFieldError('Explain what happened in a few words');
    setFieldError(undefined);
    try {
      await m.mutateAsync({ requestedChange: change, explanation: text.trim() });
      haptic.success();
      setDone(true);
    } catch (e) {
      haptic.error();
      if (e instanceof ApiError) setFieldError(e.field('explanation'));
    }
  };

  if (done) {
    return (
      <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Done" onPress={() => router.back()} />}>
        <View className="items-center pt-8">
          <ResultMark tone="success" />
        </View>
        <Stagger index={2}>
          <View className="items-center gap-2" accessibilityLiveRegion="assertive">
            <Text accessibilityRole="header" className="text-center font-display text-[28px] leading-9 text-charcoal">
              Request sent
            </Text>
            <Muted className="text-center">Operations will review it. You will get an update with their decision.</Muted>
          </View>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom', 'left', 'right']} footer={<Button title="Send request" icon={Send} busy={m.isPending} disabled={!change} onPress={() => void submit()} />}>
      {visit ? (
        <Muted>
          {visit.serviceName} · {flatLabel(visit.flat)} · {longDay(visit.scheduledDate)}
        </Muted>
      ) : null}
      <View className="gap-3" accessibilityRole="radiogroup">
        <Text className="font-medium text-[15px]">What should be corrected?</Text>
        {OPTIONS.map((o) => {
          const on = change === o.value;
          return (
            <PressScale
              key={o.value}
              onPress={() => {
                haptic.select();
                setChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${o.title}. ${o.detail}`}
            >
              <View className={`flex-row items-center gap-4 rounded-xl border-[1.5px] p-4 ${on ? 'border-teal-action bg-mint' : 'border-line bg-surface'}`}>
                <View className={`h-11 w-11 items-center justify-center rounded-md ${on ? 'bg-teal-action' : 'bg-mint'}`}>
                  <o.icon size={22} color={on ? c.white : c.tealDeep} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold">{o.title}</Text>
                  <Muted className="text-sm">{o.detail}</Muted>
                </View>
                <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-teal-action' : 'border-line'}`}>{on ? <View className="h-3 w-3 rounded-full bg-teal-action" /> : null}</View>
              </View>
            </PressScale>
          );
        })}
      </View>
      <Field label="Explain what happened" multiline value={text} onChangeText={setText} maxLength={1000} error={fieldError} placeholder="For example: the code expired twice; I was inside the flat from 8:05" />
      {m.error && !fieldError ? <Banner tone="error">{errorMessage(m.error)}</Banner> : null}
    </Screen>
  );
}
