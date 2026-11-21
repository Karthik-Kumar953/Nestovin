import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { PressScale } from './motion/PressScale';
import { colors } from './tokens';

type Tone = 'info' | 'success' | 'warning' | 'error' | 'brand';
const MAP: Record<Tone, { bg: string; border: string; fg: string; icon: IconName }> = {
  info: { bg: colors.infoSurface, border: '#BFDBFE', fg: colors.infoText, icon: 'information-circle' },
  success: { bg: colors.successSurface, border: '#BBF7D0', fg: colors.successText, icon: 'checkmark-circle' },
  warning: { bg: colors.warningSurface, border: '#FDE68A', fg: colors.warningText, icon: 'warning' },
  error: { bg: colors.errorSurface, border: '#FECACA', fg: colors.errorText, icon: 'alert-circle' },
  brand: { bg: colors.teal100, border: colors.teal200, fg: colors.tealDeep, icon: 'sparkles' },
};

/** Inline message: icon + optional title + body, with an optional action. Errors are announced as alerts. */
export function Banner({
  tone = 'info',
  title,
  children,
  icon,
  action,
  onAction,
  onPress,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  icon?: IconName;
  action?: string;
  onAction?: () => void;
  onPress?: () => void;
}) {
  const t = MAP[tone];
  const content = (
    <View
      style={{ backgroundColor: t.bg, borderColor: t.border }}
      className="flex-row gap-3 rounded-lg border px-4 py-3.5"
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      <View className="pt-0.5">
        <Icon name={icon ?? t.icon} size="sm" color={t.fg} />
      </View>
      <View className="flex-1 gap-1">
        {title ? (
          <Text variant="label" style={{ color: t.fg }}>
            {title}
          </Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text variant="sm" style={{ color: t.fg }}>
            {children}
          </Text>
        ) : (
          children
        )}
        {action && onAction ? (
          <PressScale onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={10} className="self-start min-h-[32px] justify-center">
            <Text variant="label" style={{ color: t.fg }} className="underline">
              {action}
            </Text>
          </PressScale>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron-forward" size="sm" color={t.fg} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressScale onPress={onPress} haptic="tap" scaleTo={0.985} accessibilityRole="button" accessibilityLabel={[title, typeof children === 'string' ? children : ''].filter(Boolean).join('. ')}>
      {content}
    </PressScale>
  );
}
