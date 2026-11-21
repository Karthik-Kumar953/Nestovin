import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, WifiOff, XCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImageName } from '../assets/images';
import { ApiError } from '../lib/api';
import { useOnline } from '../lib/net';
import { BrandImage } from './media';
import { Button, Muted, Text } from './primitives';
import { c, toneColors } from './theme';

/** Inline banner (status = colour + icon + words). Announced politely. */
export function Banner({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = toneColors[tone];
  const Icon: LucideIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }[tone];
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole={tone === 'error' ? 'alert' : undefined} className="flex-row gap-3 rounded-md p-3.5" style={{ backgroundColor: t.bg }}>
      <Icon size={20} color={t.fg} strokeWidth={2} style={{ marginTop: 2 }} />
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
      <View className="flex-row items-center gap-2.5 rounded-md bg-charcoal px-4 py-3">
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
    <View className="items-center gap-2 px-4 py-8">
      {image ? (
        <BrandImage name={image} variant="illustration" className="mb-2 h-36 w-36" iconSize={40} />
      ) : Icon ? (
        <View className="mb-2 h-20 w-20 items-center justify-center rounded-full bg-subtle" accessible={false}>
          <Icon size={36} color={c.textSecondary} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text accessibilityRole="header" className="text-center font-display text-headline text-charcoal">{title}</Text>
      {body ? <Muted className="text-center">{body}</Muted> : null}
      {action ? <View className="mt-3 w-full">{action}</View> : null}
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
    <View accessible={false} className={`overflow-hidden rounded-md ${className ?? ''}`}>
      <Animated.View style={[{ flex: 1, backgroundColor: c.border }, style]} />
    </View>
  );
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-lg" />
      ))}
    </View>
  );
}

/**
 * Loading state while the session and profile load: the Today layout in
 * placeholders (header, segmented control, progress, next-visit card), so the
 * first paint already has the shape of the screen. Never a blank screen.
 */
export function AppLoading() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <View className="gap-4 px-4 pt-2" accessible accessibilityRole="progressbar" accessibilityLabel="Loading your work">
        <View className="min-h-[64px] flex-row items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
          </View>
          <Skeleton className="h-12 w-12" />
        </View>
        <Skeleton className="h-12" />
        <Skeleton className="h-1 rounded-full" />
        <Skeleton className="h-[220px] rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </View>
    </SafeAreaView>
  );
}
