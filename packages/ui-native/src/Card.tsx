import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { PressScale } from './motion/PressScale';
import { colors, elevation } from './tokens';

type Tone = 'surface' | 'mint' | 'brand' | 'subtle';
const TONE: Record<Tone, string> = {
  surface: 'bg-white border border-line/70',
  mint: 'bg-teal-100 border border-teal-200',
  brand: 'bg-teal-deep',
  subtle: 'bg-surface-subtle',
};

/** Grouping surface: white on mint, 24 corners, hairline border, a soft shadow only when `raised`. */
export function Card({
  children,
  onPress,
  tone = 'surface',
  raised = false,
  padded = true,
  className = '',
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: Tone;
  raised?: boolean;
  padded?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const cls = `${TONE[tone]} rounded-xl ${padded ? 'p-5' : ''} gap-3 overflow-hidden ${className}`;
  const shadow = raised ? elevation.card : undefined;
  if (onPress) {
    return (
      <PressScale
        onPress={onPress}
        haptic="tap"
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        className={cls}
        style={[shadow, style]}
      >
        {children}
      </PressScale>
    );
  }
  return (
    <View className={cls} style={[shadow, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

/** Square tinted tile holding an icon (leading element of rows and cards). */
export function IconTile({ icon, tone = 'teal', size = 44 }: { icon: IconName; tone?: 'teal' | 'success' | 'warning' | 'error' | 'info' | 'inverse'; size?: number }) {
  const map = {
    teal: [colors.teal100, colors.tealDeep],
    success: [colors.successSurface, colors.successText],
    warning: [colors.warningSurface, colors.warningText],
    error: [colors.errorSurface, colors.errorText],
    info: [colors.infoSurface, colors.infoText],
    inverse: ['rgba(255,255,255,0.18)', colors.white],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg }} className="items-center justify-center">
      <Icon name={icon} color={fg} size={size * 0.5} />
    </View>
  );
}

/** Row in a list: leading tile, title, subtitle, trailing value or chevron. Stacks gracefully at large text sizes. */
export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  chevron = Boolean(onPress),
  destructive = false,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <View className="flex-row items-center gap-3 min-h-[56px] py-2">
      {leading ?? (icon ? <IconTile icon={icon} tone={destructive ? 'error' : 'teal'} size={40} /> : null)}
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" tone={destructive ? 'error' : 'default'}>
          {title}
        </Text>
        {subtitle ? <Text variant="sm" tone="muted">{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron-forward" size="sm" color={colors.textSecondary} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} haptic="tap" scaleTo={0.985} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}>
      {body}
    </PressScale>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ marginLeft: inset }} className="h-px bg-line" />;
}

/** Section heading with an optional trailing text action. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-end justify-between mt-2">
      <Text variant="h3">{title}</Text>
      {action && onAction ? (
        <PressScale onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={10} className="min-h-[44px] justify-center">
          <Text variant="label" tone="brand">
            {action}
          </Text>
        </PressScale>
      ) : null}
    </View>
  );
}
