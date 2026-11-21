import { ActivityIndicator, View, type GestureResponderEvent } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { PressScale } from './motion/PressScale';
import { colors } from './tokens';

export type ButtonVariant =
  'primary' | 'secondary' | 'tertiary' | 'destructive' | 'inverse' | 'soft';

const BG: Record<ButtonVariant, string> = {
  primary: 'bg-teal',
  secondary: 'bg-white border border-teal',
  tertiary: 'bg-transparent',
  destructive: 'bg-error-text',
  inverse: 'bg-white',
  soft: 'bg-teal-100',
};
const FG: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.tealAction,
  tertiary: colors.tealAction,
  destructive: colors.white,
  inverse: colors.tealDeep,
  soft: colors.tealDeep,
};

/**
 * Buttons per DESIGN.md: teal-action fill (5.3:1 with white), 52 tall (44 for `size="sm"`),
 * 12 pt corners on both platforms (same family as the Worker app). Pressed: spring scale; loading: spinner plus label kept for screen readers.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  block = true,
  haptic = 'tap',
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  haptic?: 'tap' | 'select' | false;
  accessibilityHint?: string;
  testID?: string;
}) {
  const off = disabled || loading;
  const fg = FG[variant];
  const radius = 'rounded-md';
  const height = size === 'md' ? 'min-h-[52px] px-5' : 'min-h-[44px] px-4';
  return (
    <PressScale
      onPress={onPress}
      disabled={off}
      haptic={off ? false : haptic}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      aria-disabled={off}
      aria-busy={loading}
      android_ripple={
        variant === 'tertiary' ? undefined : { color: 'rgba(255,255,255,0.18)', borderless: false }
      }
      testID={testID}
      hitSlop={size === 'sm' ? 4 : 0}
      className={`${BG[variant]} ${radius} ${height} ${block ? 'self-stretch' : 'self-start'} items-center justify-center overflow-hidden ${off && !loading ? 'opacity-45' : ''}`}
    >
      <View className="flex-row items-center justify-center gap-2">
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : icon ? (
          <Icon name={icon} size="sm" color={fg} />
        ) : null}
        <Text
          variant={size === 'md' ? 'bodyStrong' : 'label'}
          style={{ color: fg }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {iconRight && !loading ? <Icon name={iconRight} size="sm" color={fg} /> : null}
      </View>
    </PressScale>
  );
}

/** 44 pt round icon button for headers; the badge is announced in the label. */
export function IconButton({
  icon,
  label,
  onPress,
  badge,
  tone = 'default',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  tone?: 'default' | 'inverse' | 'plain';
}) {
  const bg =
    tone === 'inverse'
      ? 'bg-white/20'
      : tone === 'plain'
        ? 'bg-transparent'
        : 'bg-white border border-line';
  return (
    <PressScale
      onPress={onPress}
      haptic="tap"
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      className={`h-11 w-11 items-center justify-center rounded-full ${bg}`}
      hitSlop={4}
    >
      <Icon name={icon} color={tone === 'inverse' ? colors.white : colors.textPrimary} />
      {badge ? (
        <View className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] rounded-full bg-error-text items-center justify-center px-1 border-2 border-white">
          <Text variant="caption" tone="inverse" className="text-[10px] leading-[12px] font-bold">
            {badge > 9 ? '9+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </PressScale>
  );
}
