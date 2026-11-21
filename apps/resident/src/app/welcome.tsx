import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  useAnimatedRef,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Button, Photo, Text, colors, type IconName } from '@nestovin/ui-native';
import { useAuth } from '../lib/auth';
import { img, type ShotName } from '../assets/images';
import { Logo } from '../components/common';
import { DemoLoginButton } from '../components/DemoLoginButton';

type Step = {
  photo: ShotName;
  icon: IconName;
  tone: 'brand' | 'dusk' | 'sage';
  title: string;
  body: string;
  alt: string;
};

const STEPS: Step[] = [
  {
    photo: 'onb-verified-staff.jpg',
    icon: 'shield-checkmark-outline',
    tone: 'brand',
    title: 'Verified staff, managed by Nestovin',
    body: 'Salaried, trained and verified by us, then assigned to your community. Not a marketplace of freelancers.',
    alt: 'A Nestovin staff member in uniform at a resident’s door',
  },
  {
    photo: 'onb-book-services.jpg',
    icon: 'calendar-outline',
    tone: 'dusk',
    title: 'Book Maid, Cook or Caretaker for your flat',
    body: 'Choose a plan for your flat and a time slot that suits you. We confirm who is coming.',
    alt: 'A cook preparing a meal in a bright home kitchen',
  },
  {
    photo: 'onb-track-visits.jpg',
    icon: 'qr-code-outline',
    tone: 'sage',
    title: 'Track every visit, get help fast',
    body: 'See who is coming, check them in with your code, and tell us if anything is not right.',
    alt: 'A resident checking a visit on her phone',
  },
];

/** First run for signed-out residents: three swipeable steps, then phone sign-in. */
export default function Welcome() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue(0);
  const [page, setPage] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  if (session) return <Redirect href="/" />;

  const last = page === STEPS.length - 1;
  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  return (
    <View
      className="flex-1 bg-mint"
      style={{ paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View className="flex-row items-center justify-between px-gutter min-h-[48px]">
        <View className="flex-row items-center gap-2">
          <Logo size={30} />
          <Text variant="h3" accessibilityRole="none">
            Nestovin
          </Text>
        </View>
        {!last ? (
          <Pressable
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Skip to sign in"
            hitSlop={8}
            className="min-h-[48px] min-w-[48px] items-center justify-center px-2 rounded-md active:bg-teal-100"
          >
            <Text variant="label" tone="brand">
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1" onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
          accessibilityLabel="Welcome steps"
        >
          {STEPS.map((s, i) => (
            <View
              key={s.photo}
              style={{ width, height: pagerHeight || undefined }}
              className="px-gutter pt-4 pb-2 gap-6"
              accessibilityElementsHidden={i !== page}
              importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}
            >
              <Photo
                source={img(s.photo)}
                fallbackIcon={s.icon}
                fallbackTone={s.tone}
                alt={s.alt}
                className="rounded-lg"
                style={{ flex: 1, minHeight: 140, maxHeight: 400 }}
              />
              <View className="gap-2">
                <Text variant="title">{s.title}</Text>
                <Text variant="lead" tone="muted">
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </Animated.ScrollView>
      </View>

      <View className="px-gutter gap-3 pt-2">
        <View className="flex-row items-center justify-center gap-1" accessibilityRole="tablist">
          {STEPS.map((s, i) => (
            <Dot
              key={s.photo}
              i={i}
              x={x}
              width={width}
              selected={i === page}
              onPress={() => goTo(i)}
            />
          ))}
        </View>
        <Button
          title={last ? 'Get started' : 'Next'}
          iconRight="arrow-forward"
          onPress={() => (last ? router.push('/sign-in') : goTo(page + 1))}
          accessibilityHint={last ? 'Opens sign in with your mobile number' : undefined}
        />
        <DemoLoginButton />
      </View>
    </View>
  );
}

/** Page dot that stretches as its step scrolls into view (follows the finger; no timed animation). */
function Dot({
  i,
  x,
  width,
  selected,
  onPress,
}: {
  i: number;
  x: SharedValue<number>;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(
      x.value / Math.max(width, 1),
      [i - 1, i, i + 1],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      width: 8 + 16 * t,
      backgroundColor: t > 0.5 ? colors.tealAction : colors.teal300,
    };
  });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={selected}
      accessibilityLabel={`Step ${i + 1} of ${STEPS.length}`}
      className="h-12 min-w-[32px] items-center justify-center"
    >
      <Animated.View style={[{ height: 8, borderRadius: 4 }, style]} />
    </Pressable>
  );
}
