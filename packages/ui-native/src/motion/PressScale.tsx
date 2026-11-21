import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptics } from '../haptics';

const APressable = Animated.createAnimatedComponent(Pressable);

export type PressScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Scale while pressed (0.95 to 0.99). */
  scaleTo?: number;
  haptic?: 'tap' | 'select' | false;
};

/** Tappable surface with a subtle spring scale on press (an opacity dip under Reduce Motion). Layout never shifts. */
export function PressScale({ children, style, className, scaleTo = 0.97, haptic = false, onPressIn, onPressOut, onPress, ...rest }: PressScaleProps) {
  const reduce = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() =>
    reduce ? { opacity: 1 - pressed.value * 0.2 } : { transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }] },
  );
  return (
    <APressable
      {...rest}
      className={className}
      style={[style, animated]}
      onPressIn={(e) => {
        pressed.value = reduce ? withTiming(1, { duration: 80 }) : withSpring(1, { damping: 20, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = reduce ? withTiming(0, { duration: 120 }) : withSpring(0, { damping: 16, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics[haptic]();
        onPress?.(e);
      }}
    >
      {children}
    </APressable>
  );
}
