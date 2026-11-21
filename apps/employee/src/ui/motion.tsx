import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LucideIcon } from 'lucide-react-native';
import { Check, X } from 'lucide-react-native';
import { shadow } from './primitives';
import { c, motion } from './theme';

/*
 * Motion that explains cause and effect: list entrance, check-in result,
 * offer accepted. Reanimated skips layout animations under Reduce Motion
 * (ReduceMotion.System); value animations check useReducedMotion().
 */

/** List stagger: 45 ms per item, capped so long lists do not feel slow. */
export function Stagger({ index, children, style }: { index: number; children: ReactNode; style?: ViewStyle }) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(Math.min(index, 8) * motion.stagger)
        .duration(motion.slow)
        .easing(Easing.out(Easing.cubic))
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}

export function FadeInView({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: ViewStyle }) {
  return (
    <Animated.View style={style} entering={FadeIn.delay(delay).duration(motion.base).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}

/**
 * Result mark for check-in / completion / offers: a circle springs in, the
 * icon pops, two rings ripple out once. Reduce Motion: a plain cross-fade.
 */
export function ResultMark({ tone, size = 112 }: { tone: 'success' | 'warning' | 'error'; size?: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.4);
  const icon = useSharedValue(reduce ? 1 : 0);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    scale.value = withSpring(1, { damping: 11, stiffness: 180 });
    icon.value = withDelay(140, withSpring(1, { damping: 9, stiffness: 220 }));
    ring.value = withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [icon, reduce, ring, scale]);
  const fill = { success: c.greenAction, warning: c.warningText, error: c.errorText }[tone];
  const halo = { success: c.successSurface, warning: c.warningSurface, error: c.errorSurface }[tone];
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glyph = useAnimatedStyle(() => ({ transform: [{ scale: icon.value }], opacity: icon.value }));
  const r1 = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ring.value * 0.6 }], opacity: (1 - ring.value) * 0.5 }));
  const r2 = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ring.value * 1.05 }], opacity: (1 - ring.value) * 0.3 }));
  const Glyph: LucideIcon = tone === 'error' ? X : tone === 'warning' ? AlertGlyph : Check;
  return (
    <View className="items-center justify-center" style={{ width: size * 2, height: size * 2 }} accessible={false}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: halo }, r2]} />
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: halo }, r1]} />
      <Animated.View style={[{ width: size * 1.3, height: size * 1.3, borderRadius: size, backgroundColor: halo, alignItems: 'center', justifyContent: 'center' }, circle]}>
        <View style={{ width: size, height: size, borderRadius: size, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={glyph}>
            <Glyph size={size * 0.48} color={c.white} strokeWidth={3} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

/** "!" glyph sized like lucide icons, for the flagged-but-accepted state. */
const AlertGlyph = (({ size = 24, color = c.white }: { size?: number; color?: string }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.14, height: size * 0.5, borderRadius: size, backgroundColor: color }} />
    <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: color, marginTop: size * 0.1 }} />
  </View>
)) as unknown as LucideIcon;

/** Slow breathing pulse for "live" dots (current visit). Off under Reduce Motion. */
export function PulseDot({ color = c.tealAction, size = 10 }: { color?: string; size?: number }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (!reduce) v.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 0 })), -1);
  }, [reduce, v]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.value * 1.6 }], opacity: 0.45 * (1 - v.value) }));
  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, halo]} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

function useReduceTransparency() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setOn);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/**
 * Floating primary action. iOS 26+: Liquid Glass capsule (teal tint,
 * interactive). Older iOS or Reduce Transparency: solid teal capsule.
 * Android: Material 3 extended FAB, right-aligned, 16 dp corners.
 */
export function FloatingAction({ label, icon: Icon, onPress, hint }: { label: string; icon: LucideIcon; onPress: () => void; hint?: string }) {
  const reduceTransparency = useReduceTransparency();
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable() && !reduceTransparency;
  const content = (
    <View className="min-h-[56px] flex-row items-center justify-center gap-2.5 px-6">
      <Icon size={22} color={c.white} strokeWidth={2.25} />
      <Text allowFontScaling className="font-semibold text-lead text-white">
        {label}
      </Text>
    </View>
  );
  if (Platform.OS === 'android') {
    return (
      <View className="absolute bottom-5 right-5" style={shadow.float}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} android_ripple={{ color: `${c.white}33` }} className="overflow-hidden rounded-2xl bg-teal-action">
          {content}
        </Pressable>
      </View>
    );
  }
  return (
    <View className="absolute bottom-4 left-5 right-5" style={glass ? undefined : shadow.float}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}>
        {glass ? (
          <GlassView isInteractive glassEffectStyle="regular" tintColor={c.tealAction} style={{ borderRadius: 999, overflow: 'hidden' }}>
            {content}
          </GlassView>
        ) : (
          <View className="overflow-hidden rounded-full bg-teal-action">{content}</View>
        )}
      </Pressable>
    </View>
  );
}
