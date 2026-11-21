import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

/** True while Reduce Transparency is on (iOS); always false elsewhere. */
export function useReduceTransparency() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((v) => alive && setOn(v));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** Liquid Glass is used only on iOS 26+ with Reduce Transparency off (Mobile_Design_System.md). */
export function useLiquidGlass() {
  const reduce = useReduceTransparency();
  return Platform.OS === 'ios' && !reduce && safeAvailable();
}

function safeAvailable() {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/**
 * Navigation chrome and floating controls only (never cards, lists or text blocks).
 * Falls back to solid white with a hairline border, or a solid tint when `tint` is set.
 */
export function GlassSurface({
  children,
  style,
  className = '',
  tint,
  interactive = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  tint?: string;
  interactive?: boolean;
}) {
  const glass = useLiquidGlass();
  if (glass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive={interactive}
        colorScheme="light"
        style={[{ overflow: 'hidden' }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        { backgroundColor: tint ?? '#FFFFFF', borderWidth: tint ? 0 : 1, borderColor: '#E5E7EB' },
        style,
      ]}
      className={className}
    >
      {children}
    </View>
  );
}
