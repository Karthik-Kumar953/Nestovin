import type { ReactNode, ReactElement } from 'react';
import { Platform, RefreshControl, View, type ScrollViewProps } from 'react-native';
import Animated, { interpolate, Extrapolation, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './Button';
import { GlassSurface } from './GlassSurface';
import { Text } from './Text';
import { colors } from './tokens';

export type ScreenProps = {
  /** Large title (iOS large-title pattern; collapses into a compact bar on scroll). */
  title?: string;
  /** Small line above the title (community, flat). */
  eyebrow?: string | null;
  subtitle?: string | null;
  /** Header actions on the right (IconButtons). */
  actions?: ReactNode;
  /** Back button (pushed screens). */
  onBack?: () => void;
  /** Replaces the large title (e.g. a photo hero). The compact bar still appears on scroll when `title` is set. */
  hero?: ReactNode;
  children: ReactNode;
  /** Sticky bottom bar (one primary action). */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom space when a tab bar or floating action overlays content. */
  bottomInset?: number;
  scroll?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  background?: 'mint' | 'white';
};

/**
 * Screen scaffold: safe areas, a large title that collapses into a compact bar,
 * pull to refresh, and an optional sticky footer. Content gutter is 20.
 */
export function Screen({
  title,
  eyebrow,
  subtitle,
  actions,
  onBack,
  hero,
  children,
  footer,
  refreshing = false,
  onRefresh,
  bottomInset = 0,
  scroll = true,
  keyboardShouldPersistTaps = 'handled',
  background = 'mint',
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const threshold = hero ? 180 : 44;
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [threshold - 20, threshold + 10], [0, 1], Extrapolation.CLAMP) }));
  const bg = background === 'mint' ? colors.background : colors.white;
  const back = onBack ? <IconButton icon={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} label="Back" onPress={onBack} tone={hero ? 'inverse' : 'default'} /> : null;

  const header = hero ?? (
    <View className="px-gutter pt-2 pb-4 gap-3">
      {(onBack || actions) && title ? (
        <View className="flex-row items-center justify-between min-h-[44px]">
          {back ?? <View />}
          <View className="flex-row gap-2">{actions}</View>
        </View>
      ) : null}
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-0.5">
          {eyebrow ? <Text variant="label" tone="muted">{eyebrow}</Text> : null}
          {title ? (
            <Text variant="title" style={Platform.OS === 'android' ? { fontFamily: 'Manrope_600SemiBold', fontSize: 28, lineHeight: 36 } : undefined}>
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text variant="body" tone="muted" className="mt-1">{subtitle}</Text> : null}
        </View>
        {!onBack && actions ? <View className="flex-row gap-2 pb-0.5">{actions}</View> : null}
      </View>
    </View>
  );

  const body = <View className="px-gutter gap-4">{children}</View>;
  const footerSpace = footer ? 112 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingTop: hero ? 0 : insets.top, paddingBottom: insets.bottom + 32 + bottomInset + footerSpace }}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealAction} colors={[colors.tealAction]} progressViewOffset={insets.top} /> : undefined}
        >
          {header}
          {body}
        </Animated.ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: hero ? 0 : insets.top }}>
          {header}
          <View style={{ flex: 1 }} className="px-gutter">
            {children}
          </View>
        </View>
      )}

      {title && scroll ? (
        <Animated.View style={[bar, { position: 'absolute', top: 0, left: 0, right: 0 }]} pointerEvents="box-none">
          <GlassSurface style={{ paddingTop: insets.top, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View className="flex-row items-center gap-2 px-3 h-[52px]">
              {onBack ? <IconButton icon={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} label="Back" onPress={onBack} tone="plain" /> : <View className="w-2" />}
              <Text variant="bodyStrong" className="flex-1 text-charcoal" numberOfLines={1} accessibilityRole="none">
                {title}
              </Text>
              {actions ? <View className="flex-row gap-2">{actions}</View> : null}
            </View>
          </GlassSurface>
        </Animated.View>
      ) : null}

      {hero && onBack ? <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>{back}</View> : null}

      {footer ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12) + bottomInset, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.border }} className="px-gutter pt-3 gap-2">
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** Spacer helper for vertical rhythm between sections. */
export function Gap({ size = 8 }: { size?: number }): ReactElement {
  return <View style={{ height: size }} />;
}
