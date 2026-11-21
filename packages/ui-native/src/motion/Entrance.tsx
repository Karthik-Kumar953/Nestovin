import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { motion } from '../tokens';

/**
 * Entrance for content arriving on screen. `index` staggers list items (45 ms apart, capped at 10).
 * Reduce Motion: a short crossfade with no movement.
 */
export function Entrance({
  children,
  index = 0,
  delay = 0,
  style,
  className,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const wait = delay + Math.min(index, 10) * motion.stagger;
  const entering = reduce
    ? FadeIn.duration(motion.fast)
    : FadeInDown.delay(wait).springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness).mass(motion.spring.mass);
  return (
    <Animated.View entering={entering} exiting={FadeOut.duration(motion.fast)} style={style} className={className}>
      {children}
    </Animated.View>
  );
}
