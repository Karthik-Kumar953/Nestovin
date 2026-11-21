import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LOGO } from '../assets/images';
import { c } from './theme';

/*
 * Launch splash, identical in look and motion to the Resident app's
 * (apps/resident/src/components/AnimatedSplash.tsx): same #F5FAF9 frame, same
 * 160 dp mark in the same place as the native splash (app.json), same ring,
 * wordmark layout, timing and ease-out. Only the tagline differs. Keep the two
 * in step when either changes.
 */

/** Same width as the native splash image in app.json (expo-splash-screen imageWidth), so the hand-off does not jump. */
const MARK_WIDTH = 160;
const MARK_HEIGHT = MARK_WIDTH * (552 / 620);
/** The authored moment, end to end (ms). */
const DURATION = 1400;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Picks up exactly where the native splash leaves off, then plays one moment:
 * the mark settles upward while a soft brand-teal ring expands once behind it
 * and the wordmark eases in. It fades out as soon as the moment has played AND
 * `ready` (session restored) is true; a tap skips the rest once ready.
 * Reduce Motion: a static frame, then a fade.
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
    // `leave` is stable for this component's life; only played/ready should re-run this.
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
          style={[StyleSheet.absoluteFill, { backgroundColor: c.background }, veilStyle]}
          onLayout={() => start()}
          accessibilityLabel="Nestovin Worker is loading"
          accessibilityRole="progressbar"
        >
          <Pressable style={styles.center} onPress={() => ready && leave()} accessible={false}>
            <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />
            <Animated.View style={markStyle}>
              <Image source={LOGO} style={{ width: MARK_WIDTH, height: MARK_HEIGHT }} contentFit="contain" accessible={false} />
            </Animated.View>
            <Animated.View style={[styles.word, wordStyle]}>
              <Text style={styles.display} maxFontSizeMultiplier={1.6} accessible={false}>
                Nestovin
              </Text>
              <Text style={styles.tagline} maxFontSizeMultiplier={2} accessible={false}>
                Worker · your day’s visits in one place
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
    backgroundColor: c.tealAction,
  },
  word: { position: 'absolute', top: '50%', marginTop: MARK_HEIGHT / 2 - 24, gap: 4 },
  // Resident ui-native Text variant="display": Manrope 800, 34/40, tracking tight, ink.
  display: { fontFamily: 'Manrope_800ExtraBold', fontSize: 34, lineHeight: 40, letterSpacing: -0.85, color: c.textPrimary, textAlign: 'center' },
  // Resident variant="sm" tone="muted": Inter 14, secondary ink.
  tagline: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center' },
});
