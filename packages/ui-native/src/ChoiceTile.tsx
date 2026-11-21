import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { PressScale } from './motion/PressScale';
import { colors } from './tokens';

/**
 * Selectable tile for single (radio) or multiple (checkbox) choice: title, description, optional icon,
 * trailing meta (a price, a rank). Selected = teal border + mint fill + filled indicator.
 */
export function ChoiceTile({
  title,
  description,
  icon,
  meta,
  selected,
  onPress,
  kind = 'radio',
  disabled = false,
  rank,
  compact = false,
}: {
  title: string;
  description?: string | null;
  icon?: IconName;
  meta?: ReactNode;
  selected: boolean;
  onPress: () => void;
  kind?: 'radio' | 'checkbox';
  disabled?: boolean;
  /** Shows 1, 2, 3 in the indicator (ranked preferences). */
  rank?: number;
  compact?: boolean;
}) {
  const ring = useAnimatedStyle(() => ({
    borderColor: withTiming(selected ? colors.tealAction : colors.border, { duration: 160 }),
    backgroundColor: withTiming(selected ? colors.teal50 : colors.white, { duration: 160 }),
  }));
  const indicator = kind === 'radio' ? 'rounded-full' : 'rounded-[7px]';
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      scaleTo={0.985}
      accessibilityRole={kind}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={[title, description, rank ? `choice ${rank}` : null].filter(Boolean).join(', ')}
    >
      <Animated.View style={[ring, { borderWidth: 1.5 }]} className={`flex-row items-center gap-3 rounded-lg ${compact ? 'px-4 py-3 min-h-[52px]' : 'p-4 min-h-[64px]'} ${disabled ? 'opacity-45' : ''}`}>
        {icon ? (
          <View className={`h-10 w-10 rounded-md items-center justify-center ${selected ? 'bg-teal' : 'bg-teal-100'}`}>
            <Icon name={icon} size={20} color={selected ? colors.white : colors.tealDeep} />
          </View>
        ) : null}
        <View className="flex-1 gap-0.5">
          <Text variant="bodyStrong">{title}</Text>
          {description ? <Text variant="sm" tone="muted">{description}</Text> : null}
        </View>
        {meta}
        <View className={`h-6 w-6 items-center justify-center border-2 ${indicator} ${selected ? 'bg-teal border-teal' : 'border-line bg-white'}`}>
          {selected ? (
            rank ? (
              <Text variant="caption" tone="inverse" className="font-bold">
                {String(rank)}
              </Text>
            ) : (
              <Icon name="checkmark" size={14} color={colors.white} />
            )
          ) : null}
        </View>
      </Animated.View>
    </PressScale>
  );
}
