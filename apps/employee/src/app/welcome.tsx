import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, BadgeCheck, CalendarCheck2, ClipboardPen, Wallet } from 'lucide-react-native';
import { LOGO } from '../assets/images';
import { useAuth } from '../lib/auth';
import { BrandImage, Button, FadeInView, Stagger, Text, c, gradients } from '../ui';

const POINTS = [
  { icon: CalendarCheck2, text: 'Your visits for the day, in one place' },
  { icon: BadgeCheck, text: 'Check in with the resident’s code' },
  { icon: Wallet, text: 'Payslips, leave and training' },
];

/** First screen for a signed-out phone: sign in, or apply to work with Nestovin (EMP-01). */
export default function Welcome() {
  const { session } = useAuth();
  if (session) return <Redirect href="/(app)/(tabs)" />;
  return (
    <View className="flex-1 bg-charcoal">
      <BrandImage name="wrk-onboarding-hero" className="absolute inset-0" iconSize={0} />
      <LinearGradient colors={gradients.welcome} locations={[0, 0.45, 0.85]} style={{ position: 'absolute', inset: 0 }} />
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 justify-between px-6 pb-4 pt-6">
          <FadeInView>
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-white">
                <Image source={LOGO} style={{ width: 34, height: 30 }} contentFit="contain" accessibilityLabel="Nestovin" />
              </View>
              <View>
                <Text className="font-heading text-xl text-white">Nestovin</Text>
                <Text className="font-medium text-label uppercase tracking-widest text-white/80">Worker</Text>
              </View>
            </View>
          </FadeInView>

          <View className="gap-6">
            <Stagger index={0}>
              <Text accessibilityRole="header" className="font-display text-hero text-white">
                Good work,{'\n'}made simple.
              </Text>
            </Stagger>
            <View className="gap-3">
              {POINTS.map((p, i) => (
                <Stagger key={p.text} index={i + 1}>
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
                      <p.icon size={18} color={c.white} strokeWidth={2} />
                    </View>
                    <Text className="flex-1 text-lead text-white/95">{p.text}</Text>
                  </View>
                </Stagger>
              ))}
            </View>
            <Stagger index={5}>
              <View className="gap-3 pt-2">
                <Button title="Sign in with Employee ID" variant="light" icon={ArrowRight} onPress={() => router.push('/sign-in')} />
                <Button title="Apply to work with us" variant="onDark" icon={ClipboardPen} onPress={() => router.push('/apply')} />
              </View>
            </Stagger>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
