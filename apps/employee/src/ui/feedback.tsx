import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, WifiOff, XCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImageName } from '../assets/images';
import { ApiError } from '../lib/api';
import { useOnline } from '../lib/net';
import { BrandImage } from './media';
import { Button, Muted, Text } from './primitives';
import { c, gradients, toneColors } from './theme';

/** Inline banner (status = colour + icon + words). Announced politely. */
export function Banner({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = toneColors[tone];
  const Icon: LucideIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }[tone];
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole={tone === 'error' ? 'alert' : undefined} className="flex-row gap-3 rounded-lg p-4" style={{ backgroundColor: t.bg }}>
      <Icon size={22} color={t.fg} strokeWidth={2} />
      <View className="flex-1 gap-1">
        {title ? (
          <Text className="font-semibold" style={{ color: t.fg }}>
            {title}
          </Text>
        ) : null}
        {children ? (
          typeof children === 'string' ? (
            <Text className="text-body-sm" style={{ color: t.fg }}>
              {children}
            </Text>
          ) : (
            children
          )
        ) : null}
        {action}
      </View>
    </View>
  );
}

/** Thin offline strip used on every signed-in screen. */
export function OfflineBanner({ message = 'You are offline. Showing what was last loaded.' }: { message?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)} accessibilityLiveRegion="polite">
      <View className="flex-row items-center gap-2.5 rounded-lg bg-charcoal px-4 py-3">
        <WifiOff size={18} color={c.white} />
        <Text className="flex-1 text-body-sm text-white">{message}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * Empty or result state. Pass `image` for a branded illustration, or `icon`
 * for a neutral one (a plain icon on a subtle disc) when no illustration fits.
 */
export function EmptyState({ image, icon: Icon, title, body, action }: { image?: ImageName; icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <View className="items-center gap-3 px-6 py-8">
      {image ? (
        <BrandImage name={image} variant="illustration" className="h-40 w-40" iconSize={44} />
      ) : Icon ? (
        <View className="h-24 w-24 items-center justify-center rounded-full bg-subtle" accessible={false}>
          <Icon size={40} color={c.textSecondary} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text className="text-center font-heading text-xl text-charcoal">{title}</Text>
      {body ? <Muted className="text-center">{body}</Muted> : null}
      {action ? <View className="mt-2 w-full">{action}</View> : null}
    </View>
  );
}

/** Error with a recovery path. Offline errors get the offline illustration. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.isNetwork;
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return (
    <EmptyState
      image={offline ? 'ill-offline' : 'ill-rejected'}
      title={offline ? 'No internet connection' : 'Could not load this'}
      body={offline ? 'Check your mobile data or Wi-Fi. We will try again when you are back online.' : message}
      action={onRetry ? <Button title="Try again" variant="secondary" icon={RotateCcw} onPress={onRetry} /> : undefined}
    />
  );
}

/** Shimmering placeholder. Reduce Motion: static. */
export function Skeleton({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [o, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  // Size and shape come from className on a plain View; only opacity animates.
  return (
    <View accessible={false} className={`overflow-hidden rounded-lg ${className ?? ''}`}>
      <Animated.View style={[{ flex: 1, backgroundColor: c.mintStrong }, style]} />
    </View>
  );
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </View>
  );
}

/**
 * Branded loading state while the session and profile load: the Today hero
 * band with placeholder text, then card placeholders. Never a blank screen.
 */
export function AppLoading() {
  return (
    <View style={{ flex: 1, backgroundColor: c.background }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading your work">
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingBottom: 88 }}>
        <SafeAreaView edges={['top', 'left', 'right']}>
          <View className="flex-row items-center justify-between gap-4 px-5 pt-3">
            <View className="flex-1 gap-2.5">
              <View className="h-4 w-1/3 rounded-full bg-white/20" />
              <View className="h-8 w-3/4 rounded-lg bg-white/25" />
            </View>
            <View className="h-12 w-12 rounded-full bg-white/20" />
          </View>
        </SafeAreaView>
      </LinearGradient>
      <View className="-mt-16 gap-4 px-5">
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-24" />
      </View>
    </View>
  );
}
