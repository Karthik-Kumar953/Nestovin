import { ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BadgeCheck, CalendarCheck2, ClipboardPen, LogIn, Wallet } from 'lucide-react-native';
import { LOGO } from '../assets/images';
import { useAuth } from '../lib/auth';
import { BrandImage, Button, FadeInView, Stagger, Text, c } from '../ui';

const POINTS = [
  { icon: CalendarCheck2, text: 'Your visits for the day, in one place' },
  { icon: BadgeCheck, text: 'Check in with the resident’s code' },
  { icon: Wallet, text: 'Payslips, leave and training' },
];

/**
 * First screen for a signed-out phone (EMP-01), direction C: brand mark, a
 * photo of the work (image slot wrk-onboarding-hero), what the app does, then
 * Sign in (primary) and Apply (secondary).
 */
export default function Welcome() {
  const { session } = useAuth();
  if (session) return <Redirect href="/(app)/(tabs)" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 20 }}>
        <FadeInView>
          <View className="min-h-[48px] flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-md border border-line bg-surface">
              <Image source={LOGO} style={{ width: 32, height: 28 }} contentFit="contain" accessibilityLabel="Nestovin" />
            </View>
            <View>
              <Text className="font-display text-lg leading-6 text-charcoal">Nestovin</Text>
              <Text className="font-semibold text-label text-teal-deep">Worker</Text>
            </View>
          </View>
        </FadeInView>

        <Stagger index={0}>
          {/* Image slot wrk-onboarding-hero (4:3): a worker arriving at a gated community. Designed fallback until added. */}
          <View className="overflow-hidden rounded-lg border border-line" style={{ aspectRatio: 4 / 3 }}>
            <BrandImage name="wrk-onboarding-hero" className="h-full w-full" iconSize={48} accessibilityLabel="A Nestovin worker arriving at a gated community" />
          </View>
        </Stagger>

        <Stagger index={1}>
          <View className="gap-2">
            <Text accessibilityRole="header" className="font-display text-title text-charcoal">
              Good work, made simple.
            </Text>
            <Text className="text-body-sm text-ink-secondary">The app for Nestovin’s salaried, verified workers.</Text>
          </View>
        </Stagger>

        <Stagger index={2}>
          <View className="gap-1 rounded-lg border border-line bg-surface px-4 py-2">
            {POINTS.map((p, i) => (
              <View key={p.text} className={`min-h-[52px] flex-row items-center gap-3 ${i < POINTS.length - 1 ? 'border-b border-line' : ''}`}>
                <View className="h-9 w-9 items-center justify-center rounded-md bg-mint">
                  <p.icon size={18} color={c.tealDeep} strokeWidth={2} />
                </View>
                <Text className="flex-1 text-body-sm text-ink">{p.text}</Text>
              </View>
            ))}
          </View>
        </Stagger>

        <View className="flex-1" />
        <Stagger index={3}>
          <View className="gap-2">
            <Button title="Sign in with Employee ID" icon={LogIn} onPress={() => router.push('/sign-in')} />
            <Button title="Apply to work with us" variant="secondary" icon={ClipboardPen} onPress={() => router.push('/apply')} />
          </View>
        </Stagger>
      </ScrollView>
    </SafeAreaView>
  );
}
