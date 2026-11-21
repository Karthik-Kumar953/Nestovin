import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text, colors } from '@nestovin/ui-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MARK = require('../../assets/brand/logo.png') as number;

/** Same width as the native splash image in app.json (expo-splash-screen imageWidth), so the hand-off does not jump. */
const MARK_WIDTH = 160;
const MARK_HEIGHT = MARK_WIDTH * (552 / 620);
/** The authored moment, end to end (ms). */
const DURATION = 1400;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Kept visually identical to the Worker app's splash (apps/employee/src/ui/splash.tsx): same frame, mark,
 * ring, wordmark, timing and easing; only the tagline differs. Change both together.
 *
 * In-app splash that picks up exactly where the native splash leaves off (same mint background, same mark,
 * same place), then plays one authored moment: the mark settles upward while a soft brand-teal ring
 * expands once behind it and the wordmark eases in. It fades out as soon as the moment has played AND
 * `ready` (auth restored) is true; a tap skips the rest once ready. Reduce Motion: a static frame, then a fade.
 */
export function AnimatedSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [played, setPlayed] = useState(false);
  const [gone, setGone] = useState(false);
  const leaving = useRef(false);
  const started = useRef(false);

  const lift = useSharedValue(0);
  const ring = useSharedValue(0);
  const word = useSharedValue(0);
  const veil = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    // The overlay has painted the same frame as the native splash, so hiding it now is seamless.
    void SplashScreen.hideAsync().catch(() => undefined);
    if (reduce) {
      lift.value = 1;
      word.value = 1;
      setTimeout(() => setPlayed(true), 500);
      return;
    }
    lift.value = withDelay(120, withTiming(1, { duration: 700, easing: easeOut }));
    ring.value = withDelay(120, withTiming(1, { duration: 1100, easing: easeOut }));
    word.value = withDelay(
      380,
      withTiming(1, { duration: 620, easing: easeOut }, (done) => {
        if (done) scheduleOnRN(setPlayed, true);
      }),
    );
  };

  // Safety net: never hold the app for longer than the moment itself if an animation callback is dropped.
  useEffect(() => {
    const t = setTimeout(() => setPlayed(true), DURATION + 400);
    return () => clearTimeout(t);
  }, []);

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    veil.value = withTiming(0, { duration: reduce ? 200 : 320, easing: easeOut }, (done) => {
      if (done) scheduleOnRN(setGone, true);
    });
  };

  useEffect(() => {
    if (played && ready) leave();
  }, [played, ready]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -36 * lift.value }, { scale: 1 - 0.18 * lift.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.22 * (1 - ring.value),
    transform: [{ scale: 0.7 + 0.8 * ring.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: 14 * (1 - word.value) }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  return (
    <View style={{ flex: 1 }}>
      {children}
      {gone ? null : (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, veilStyle]}
          onLayout={() => start()}
          accessibilityLabel="Nestovin is loading"
          accessibilityRole="progressbar"
        >
          <Pressable style={styles.center} onPress={() => ready && leave()} accessible={false}>
            <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />
            <Animated.View style={markStyle}>
              <Image
                source={MARK}
                style={{ width: MARK_WIDTH, height: MARK_HEIGHT }}
                contentFit="contain"
                accessible={false}
              />
            </Animated.View>
            <Animated.View style={[styles.word, wordStyle]}>
              <Text
                variant="display"
                className="text-center"
                style={{ color: colors.textPrimary }}
                accessible={false}
              >
                Nestovin
              </Text>
              <Text variant="sm" tone="muted" className="text-center" accessible={false}>
                Home help, managed for your community
              </Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.tealAction,
  },
  word: { position: 'absolute', top: '50%', marginTop: MARK_HEIGHT / 2 - 24, gap: 4 },
});
