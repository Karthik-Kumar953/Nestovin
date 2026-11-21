import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../tokens';

export type ResultTone = 'success' | 'info' | 'warning' | 'error' | 'neutral';
const TONES: Record<ResultTone, { fg: string; bg: string }> = {
  success: { fg: colors.greenAction, bg: colors.successSurface },
  info: { fg: colors.infoText, bg: colors.infoSurface },
  warning: { fg: colors.warningText, bg: colors.warningSurface },
  error: { fg: colors.errorText, bg: colors.errorSurface },
  neutral: { fg: colors.textSecondary, bg: colors.surfaceSubtle },
};
const MARKS = {
  check: 'M34 51 L45 62 L67 39',
  cross: 'M39 39 L61 61 M61 39 L39 61',
  clock: 'M50 33 L50 51 L62 58',
  alert: 'M50 34 L50 54 M50 64 L50 65',
} as const;

/**
 * Animated result mark for payment success, joining a round and check-in.
 * A halo ripples out, the disc pops, then the mark springs in with a slight overshoot.
 * Only transform and opacity animate (GPU-friendly, identical on iOS, Android and web).
 * Reduce Motion: the final state at once.
 */
export function SuccessCheck({
  size = 104,
  tone = 'success',
  mark = 'check',
}: {
  size?: number;
  tone?: ResultTone;
  mark?: keyof typeof MARKS;
}) {
  const reduce = useReducedMotion();
  const disc = useSharedValue(reduce ? 1 : 0);
  const tick = useSharedValue(reduce ? 1 : 0);
  const halo = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      disc.value = 1;
      tick.value = 1;
      halo.value = 1;
      return;
    }
    disc.value = withSpring(1, { damping: 11, stiffness: 170 });
    tick.value = withDelay(220, withSpring(1, { damping: 9, stiffness: 200 }));
    halo.value = withSequence(
      withTiming(0, { duration: 0 }),
      withDelay(160, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })),
    );
  }, [reduce, disc, tick, halo, tone, mark]);

  const discStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, disc.value * 1.5),
    transform: [{ scale: 0.6 + disc.value * 0.4 }],
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, tick.value * 2),
    transform: [{ scale: 0.4 + tick.value * 0.6 }, { rotate: `${(1 - tick.value) * -12}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduce ? 0 : (1 - halo.value) * 0.5,
    transform: [{ scale: 0.8 + halo.value * 0.45 }],
  }));
  const t = TONES[tone];
  const fill = { position: 'absolute' as const, top: 0, left: 0, width: size, height: size };

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[fill, { borderRadius: size, backgroundColor: t.bg }, haloStyle]} />
      <Animated.View style={[fill, discStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={36} fill={t.bg} />
          <Circle
            cx={50}
            cy={50}
            r={36}
            stroke={t.fg}
            strokeOpacity={0.3}
            strokeWidth={3}
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[fill, tickStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path
            d={MARKS[mark]}
            stroke={t.fg}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
