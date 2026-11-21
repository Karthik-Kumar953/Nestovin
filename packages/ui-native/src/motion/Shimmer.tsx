import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** A soft light sweep across its parent (absolute fill). Reduce Motion: nothing; the parent stays a calm flat tone. */
export function Shimmer({ tint = 'rgba(255,255,255,0.6)' }: { tint?: string }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce || !w) return;
    x.value = 0;
    x.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [reduce, w, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -w + x.value * w * 2 }] }));
  if (reduce) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <LinearGradient
          colors={['transparent', tint, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
