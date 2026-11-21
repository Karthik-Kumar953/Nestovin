import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors } from './tokens';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand' | 'inverse';

const MAP: Record<StatusTone, { bg: string; fg: string; icon: IconName }> = {
  success: { bg: colors.successSurface, fg: colors.successText, icon: 'checkmark-circle' },
  warning: { bg: colors.warningSurface, fg: colors.warningText, icon: 'alert-circle' },
  error: { bg: colors.errorSurface, fg: colors.errorText, icon: 'close-circle' },
  info: { bg: colors.infoSurface, fg: colors.infoText, icon: 'time' },
  neutral: { bg: colors.surfaceSubtle, fg: colors.textSecondary, icon: 'ellipse-outline' },
  brand: { bg: colors.teal100, fg: colors.tealDeep, icon: 'sparkles' },
  inverse: { bg: 'rgba(255,255,255,0.2)', fg: colors.white, icon: 'ellipse' },
};

/** Status = colour + icon + text (never colour alone). */
export function StatusChip({ label, tone = 'neutral', icon }: { label: string; tone?: StatusTone; icon?: IconName | null }) {
  const t = MAP[tone];
  return (
    <View
      style={{ backgroundColor: t.bg }}
      className="flex-row items-center self-start gap-1 rounded-full pl-2 pr-2.5 py-1"
      accessible
      accessibilityLabel={`Status: ${label}`}
    >
      {icon === null ? null : <Icon name={icon ?? t.icon} size={14} color={t.fg} />}
      <Text variant="caption" style={{ color: t.fg }} className="font-semibold">
        {label}
      </Text>
    </View>
  );
}
