import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../tokens';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);
const RING = 2 * Math.PI * 34;
const STROKE = 60;

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
 * Animated result mark: the ring draws, the disc pops, then the mark strokes in.
 * Used for payment success, joining a round and check-in. Reduce Motion: final state at once.
 */
export function SuccessCheck({ size = 104, tone = 'success', mark = 'check' }: { size?: number; tone?: ResultTone; mark?: keyof typeof MARKS }) {
  const reduce = useReducedMotion();
  const ring = useSharedValue(reduce ? 1 : 0);
  const pop = useSharedValue(reduce ? 1 : 0.5);
  const stroke = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      ring.value = 1;
      pop.value = 1;
      stroke.value = 1;
      return;
    }
    ring.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    pop.value = withDelay(140, withSpring(1, { damping: 9, stiffness: 170 }));
    stroke.value = withDelay(340, withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) }));
  }, [reduce, ring, pop, stroke, tone, mark]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - ring.value) }));
  const markProps = useAnimatedProps(() => ({ strokeDashoffset: STROKE * (1 - stroke.value) }));
  const disc = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, Math.max(0, pop.value * 2 - 1)) }));
  const t = TONES[tone];
  const inset = size * 0.16;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: size, backgroundColor: t.bg }, disc]} />
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <ACircle
          cx={50}
          cy={50}
          r={34}
          stroke={t.fg}
          strokeOpacity={0.28}
          strokeWidth={3}
          fill="none"
          strokeDasharray={RING}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          animatedProps={ringProps}
        />
        <APath d={MARKS[mark]} stroke={t.fg} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={STROKE} animatedProps={markProps} />
      </Svg>
    </View>
  );
}
