import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { motion } from '../tokens';

/**
 * Entrance for content arriving on screen. `index` staggers list items (45 ms apart, capped at 10).
 * Reduce Motion: a short crossfade with no movement.
 * The animated wrapper takes only styles; `className` goes on a core View inside (NativeWind styles core components).
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
    <Animated.View entering={entering} exiting={FadeOut.duration(motion.fast)} style={style}>
      {className ? <View className={className}>{children}</View> : children}
    </Animated.View>
  );
}
