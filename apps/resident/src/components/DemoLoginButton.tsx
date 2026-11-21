import { ActivityIndicator, View } from 'react-native';
import { Icon, PressScale, Text, colors } from '@nestovin/ui-native';
import { useDemoLogin } from '../lib/demoLogin';

/**
 * TEMPORARY (client showcases): a clearly labelled secondary "Demo login" with a "Demo" tag.
 * Renders nothing unless EXPO_PUBLIC_DEMO_LOGIN is 'true'.
 */
export function DemoLoginButton({ disabled = false }: { disabled?: boolean }) {
  const demo = useDemoLogin();
  if (!demo.enabled) return null;
  const off = disabled || demo.busy;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text variant="caption" tone="muted">
          For showcases
        </Text>
        <View className="h-px flex-1 bg-line" />
      </View>
      <PressScale
        onPress={() => void demo.signIn()}
        disabled={off}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel="Demo login"
        accessibilityHint="Signs in as the demo resident without a phone number or code"
        aria-busy={demo.busy}
        aria-disabled={off}
        android_ripple={{ color: colors.teal100 }}
        testID="demo-login"
        className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-md border border-line bg-white px-5 overflow-hidden ${disabled ? 'opacity-45' : ''}`}
      >
        {demo.busy ? (
          <ActivityIndicator color={colors.tealAction} />
        ) : (
          <Icon name="person-circle-outline" size="sm" color={colors.tealAction} />
        )}
        <Text variant="bodyStrong" style={{ color: colors.tealAction }}>
          Demo login
        </Text>
        <View className="rounded-full bg-warning-surface px-2 py-0.5">
          <Text variant="caption" tone="warning" className="font-semibold">
            Demo
          </Text>
        </View>
      </PressScale>
      {demo.error ? (
        <View className="flex-row gap-2" accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Icon name="alert-circle" size={18} color={colors.errorText} />
          <Text variant="sm" tone="error" className="flex-1">
            {demo.error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
