import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';
import { haptics } from './haptics';
import { Text } from './Text';

/**
 * Segmented choice. iOS: sliding white thumb on a subtle track. Android: outlined segmented buttons with a mint fill.
 * Each segment is a 44+ pt tab with selected state.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = options.length ? (w - 8) / options.length : 0;
  const thumb = useAnimatedStyle(() => ({
    width: seg,
    transform: [{ translateX: reduce ? withTiming(idx * seg, { duration: 0 }) : withSpring(idx * seg, { damping: 20, stiffness: 260 }) }],
  }));
  const android = Platform.OS === 'android';
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      className={android ? 'flex-row rounded-full border border-line bg-white overflow-hidden' : 'flex-row rounded-[14px] bg-surface-subtle p-1'}
    >
      {!android && w ? <Animated.View style={[thumb, { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]} /> : null}
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!on) {
                haptics.select();
                onChange(o.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            className={`flex-1 min-h-[44px] items-center justify-center px-2 ${android && on ? 'bg-teal-100' : ''} ${android && i > 0 ? 'border-l border-line' : ''}`}
          >
            <Text variant="label" tone={on ? 'default' : 'muted'} className={on ? 'text-charcoal' : ''} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
