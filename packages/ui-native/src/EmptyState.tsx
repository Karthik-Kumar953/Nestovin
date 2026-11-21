import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Entrance } from './motion/Entrance';
import { colors } from './tokens';

/**
 * Illustrated empty or status state. Shows the clay illustration when it exists, otherwise a designed
 * mint medallion with an icon. One message, one action.
 */
export function EmptyState({
  title,
  body,
  illustration,
  icon = 'leaf-outline',
  tone = 'teal',
  children,
  compact = false,
}: {
  title: string;
  body?: string | null;
  illustration?: ImageSource | number | null;
  icon?: IconName;
  tone?: 'teal' | 'warning' | 'error' | 'info';
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Entrance className={`items-center gap-3 ${compact ? 'py-6' : 'py-10'} px-4`}>
      <Illustration source={illustration} icon={icon} tone={tone} size={compact ? 104 : 148} />
      <Text variant={compact ? 'h3' : 'h2'} className="text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" className="text-center max-w-[320px]">
          {body}
        </Text>
      ) : null}
      {children ? <View className="self-stretch gap-2 mt-2">{children}</View> : null}
    </Entrance>
  );
}

const TONES = {
  teal: { a: colors.teal100, b: colors.teal50, fg: colors.tealAction },
  warning: { a: colors.warningSurface, b: '#FFFBEB', fg: colors.warningText },
  error: { a: colors.errorSurface, b: '#FEF2F2', fg: colors.errorText },
  info: { a: colors.infoSurface, b: '#EFF6FF', fg: colors.infoText },
} as const;

export function Illustration({
  source,
  icon,
  tone = 'teal',
  size = 148,
}: {
  source?: ImageSource | number | null;
  icon: IconName;
  tone?: keyof typeof TONES;
  size?: number;
}) {
  if (source != null) {
    return (
      <Image
        source={source}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessible={false}
        transition={200}
      />
    );
  }
  const t = TONES[tone];
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessible={false}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: 1,
          borderColor: t.a,
        }}
      />
      <LinearGradient
        colors={[t.a, t.b]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{
          width: size * 0.74,
          height: size * 0.74,
          borderRadius: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: size * 0.14,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: t.fg,
            shadowOpacity: 0.15,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 3,
          }}
        >
          <Icon name={icon} size={size * 0.22} color={t.fg} />
        </View>
      </LinearGradient>
      <View
        style={{
          position: 'absolute',
          right: size * 0.1,
          top: size * 0.14,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.warning,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.12,
          bottom: size * 0.2,
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: colors.secondary,
        }}
      />
    </View>
  );
}
