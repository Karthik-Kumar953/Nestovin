import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '../haptics';

export type PressScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Scale while pressed (0.95 to 0.99). */
  scaleTo?: number;
  haptic?: 'tap' | 'select' | false;
};

/**
 * Self-alignment and flex classes have to sit on the outer animated wrapper to affect the parent layout.
 * NativeWind only styles core components, so they are mapped to plain styles here.
 */
function outerLayout(className = ''): ViewStyle {
  const tokens = className.split(/\s+/);
  const has = (c: string) => tokens.includes(c);
  const alignSelf = has('self-start')
    ? 'flex-start'
    : has('self-center')
      ? 'center'
      : has('self-end')
        ? 'flex-end'
        : has('self-stretch')
          ? 'stretch'
          : undefined;
  return { ...(alignSelf ? { alignSelf } : {}), ...(has('flex-1') ? { flex: 1 } : {}) };
}

/**
 * Tappable surface with a subtle spring scale on press (an opacity dip under Reduce Motion). Layout never shifts.
 * Structure: an Animated.View that only receives styles (scale), around a core Pressable that takes the
 * NativeWind classes, accessibility props and the Android ripple.
 */
export function PressScale({
  children,
  style,
  className,
  scaleTo = 0.97,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressScaleProps) {
  const reduce = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() =>
    reduce
      ? { opacity: 1 - pressed.value * 0.2 }
      : { transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }] },
  );
  return (
    <Animated.View style={[outerLayout(className), animated]}>
      <Pressable
        {...rest}
        className={className}
        style={style}
        onPressIn={(e) => {
          pressed.value = reduce
            ? withTiming(1, { duration: 80 })
            : withSpring(1, { damping: 20, stiffness: 400 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = reduce
            ? withTiming(0, { duration: 120 })
            : withSpring(0, { damping: 16, stiffness: 260 });
          onPressOut?.(e);
        }}
        onPress={(e) => {
          if (haptic) haptics[haptic]();
          onPress?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
