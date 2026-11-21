import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, EmptyState, GlassSurface, Icon, PressScale, Text, colors, elevation, type IconName } from '@nestovin/ui-native';
import { ApiError, errorMessage } from '../lib/api';
import { useOnline } from '../lib/online';
import { img } from '../assets/images';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/brand/logo.png') as number;

/** The approved Nestovin mark, unaltered (only scaled, aspect ratio kept). */
export function Logo({ size = 40 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size, height: size * (552 / 620) }} contentFit="contain" accessibilityLabel="Nestovin" accessible />;
}

/** Full-screen error with retry. Offline gets its own illustration and copy. */
export function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const offline = error instanceof ApiError && error.code === 'NETWORK';
  return (
    <EmptyState
      compact={compact}
      illustration={img(offline ? 'ill-offline.png' : 'ill-rejected.png')}
      icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
      tone={offline ? 'info' : 'error'}
      title={offline ? 'You are offline' : 'That did not load'}
      body={offline ? 'Check your connection and try again. Nothing you booked is affected.' : errorMessage(error)}
    >
      {onRetry ? <Button title="Try again" variant="secondary" icon="refresh" onPress={onRetry} /> : null}
    </EmptyState>
  );
}

/** Thin notice while the device is offline; cached data stays on screen. */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <Banner tone="warning" icon="cloud-offline-outline">
      You are offline. Showing what was loaded last.
    </Banner>
  );
}

/**
 * The one floating action (e.g. "Show check-in code"): a full-width Liquid Glass capsule above the
 * tab bar on iOS, an extended FAB on the right on Android.
 */
export function FloatingAction({ label, icon, onPress, offset = 0 }: { label: string; icon: IconName; onPress: () => void; offset?: number }) {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    return (
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 64 + offset }} pointerEvents="box-none">
        <PressScale onPress={onPress} haptic="tap" accessibilityRole="button" accessibilityLabel={label} style={elevation.float} className="rounded-full">
          <GlassSurface tint={colors.tealAction} interactive style={{ borderRadius: 999, overflow: 'hidden' }}>
            <View className="flex-row items-center justify-center gap-2 h-[56px] px-6">
              <Icon name={icon} color={colors.white} />
              <Text variant="bodyStrong" tone="inverse">
                {label}
              </Text>
            </View>
          </GlassSurface>
        </PressScale>
      </View>
    );
  }
  return (
    <View style={{ position: 'absolute', right: 16, bottom: 16 + offset }} pointerEvents="box-none">
      <PressScale onPress={onPress} haptic="tap" accessibilityRole="button" accessibilityLabel={label} android_ripple={{ color: 'rgba(255,255,255,0.2)' }} style={elevation.float} className="flex-row items-center gap-3 h-14 pl-4 pr-5 rounded-lg bg-teal">
        <Icon name={icon} color={colors.white} />
        <Text variant="bodyStrong" tone="inverse">
          {label}
        </Text>
      </PressScale>
    </View>
  );
}

/** Label/value line for amounts and facts. Values use tabular figures. */
export function KeyValue({ label, value, strong = false, tone }: { label: string; value: ReactNode; strong?: boolean; tone?: 'warning' | 'success' }) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <Text variant={strong ? 'bodyStrong' : 'body'} tone={strong ? 'default' : 'muted'} className="flex-1">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text variant={strong ? 'bodyStrong' : 'body'} tone={tone ?? 'default'} style={{ fontVariant: ['tabular-nums'] }} className="text-right">
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/** Vertical progress timeline (booking detail, verification). */
export function Timeline({ steps }: { steps: { title: string; detail?: string | null; state: 'done' | 'current' | 'todo'; tone?: 'warning' }[] }) {
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dot = s.state === 'done' ? colors.tealAction : s.state === 'current' ? (s.tone === 'warning' ? colors.warning : colors.tealAction) : colors.border;
        return (
          <View key={s.title} className="flex-row gap-3" accessible accessibilityLabel={`${s.title}${s.detail ? `, ${s.detail}` : ''}, ${s.state === 'done' ? 'done' : s.state === 'current' ? 'current step' : 'not yet'}`}>
            <View className="items-center w-6">
              <View style={{ backgroundColor: s.state === 'todo' ? colors.white : dot, borderColor: dot }} className="h-6 w-6 rounded-full border-2 items-center justify-center">
                {s.state === 'done' ? <Icon name="checkmark" size={14} color={colors.white} /> : s.state === 'current' ? <View className="h-2 w-2 rounded-full bg-white" /> : null}
              </View>
              {!last ? <View style={{ backgroundColor: s.state === 'done' ? colors.tealAction : colors.border }} className="w-0.5 flex-1 min-h-[20px]" /> : null}
            </View>
            <View className={`flex-1 gap-0.5 ${last ? '' : 'pb-5'}`}>
              <Text variant="bodyStrong" tone={s.state === 'todo' ? 'muted' : 'default'}>
                {s.title}
              </Text>
              {s.detail ? (
                <Text variant="sm" tone={s.tone === 'warning' && s.state !== 'done' ? 'warning' : 'muted'} className={s.tone === 'warning' ? 'font-semibold' : ''}>
                  {s.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Thin progress bar (paid of total, register steps). */
export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View className="h-2 rounded-full bg-teal-100 overflow-hidden" accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${pct * 100}%` }} className="h-full rounded-full bg-teal" />
    </View>
  );
}
