import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from './tokens';

/** One line-icon family (Ionicons outline) across both apps. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

const SIZES = { sm: 18, md: 22, lg: 28, xl: 36 } as const;

/** Decorative by default (hidden from screen readers); pass `label` when the icon carries meaning on its own. */
export function Icon({
  name,
  size = 'md',
  color = colors.textPrimary,
  label,
}: {
  name: IconName;
  size?: keyof typeof SIZES | number;
  color?: string;
  label?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={typeof size === 'number' ? size : SIZES[size]}
      color={color}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!label}
    />
  );
}
