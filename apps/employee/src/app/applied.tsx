import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { IdCard, PhoneCall, ShieldCheck } from 'lucide-react-native';
import { haptic } from '../lib/haptics';
import { Button, Muted, ResultMark, Screen, Stagger, Text, Title, c } from '../ui';

const NEXT = [
  { icon: PhoneCall, title: 'HR reviews your application', body: 'They may call you to talk about your work.' },
  { icon: ShieldCheck, title: 'Verification and training', body: 'If you are selected, HR checks your documents and you watch short training videos.' },
  { icon: IdCard, title: 'Your Employee ID', body: 'HR gives you an Employee ID and a temporary password to sign in here.' },
];

/** EMP-01 confirmation. No status tracking in V1 (open decision), so we say what happens next. */
export default function Applied() {
  useEffect(() => haptic.success(), []);
  return (
    <Screen footer={<Button title="Done" onPress={() => router.dismissTo('/welcome')} />}>
      <View className="items-center pt-6">
        <ResultMark tone="success" />
      </View>
      <Stagger index={1}>
        <View className="items-center gap-2">
          <Title className="text-center">Application sent</Title>
          <Muted className="text-center">Thank you. Our HR team has your details.</Muted>
        </View>
      </Stagger>
      <View className="gap-0 rounded-xl border border-line bg-surface p-5">
        <Text className="mb-3 font-heading text-lg text-charcoal">What happens next</Text>
        {NEXT.map((n, i) => (
          <Stagger key={n.title} index={i + 2}>
            <View className="flex-row gap-4">
              <View className="items-center">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-mint">
                  <n.icon size={20} color={c.tealDeep} strokeWidth={2} />
                </View>
                {i < NEXT.length - 1 ? <View className="my-1 w-0.5 flex-1 bg-mint-strong" /> : null}
              </View>
              <View className="flex-1 gap-0.5 pb-5">
                <Text className="font-semibold">{n.title}</Text>
                <Muted>{n.body}</Muted>
              </View>
            </View>
          </Stagger>
        ))}
      </View>
    </Screen>
  );
}
