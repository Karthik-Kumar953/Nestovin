import type { ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

export type TextVariant = 'display' | 'title' | 'h2' | 'h3' | 'lead' | 'body' | 'bodyStrong' | 'label' | 'sm' | 'caption' | 'overline' | 'metric';
export type TextTone = 'default' | 'muted' | 'inverse' | 'inverseMuted' | 'brand' | 'success' | 'warning' | 'error' | 'info';

const VARIANT: Record<TextVariant, string> = {
  display: 'font-display-x text-[34px] leading-[40px] tracking-tight',
  title: 'font-display text-title tracking-tight',
  h2: 'font-display text-h2 tracking-tight',
  h3: 'font-display-semi text-h3',
  lead: 'font-body text-lead',
  body: 'font-body text-body',
  bodyStrong: 'font-semibold text-body',
  label: 'font-semibold text-sm',
  sm: 'font-body text-sm',
  caption: 'font-medium text-caption',
  overline: 'font-semibold text-caption uppercase tracking-[1.2px]',
  metric: 'font-display text-metric tracking-tight',
};
const TONE: Record<TextTone, string> = {
  default: 'text-ink',
  muted: 'text-ink-2',
  inverse: 'text-white',
  inverseMuted: 'text-white/80',
  brand: 'text-teal',
  success: 'text-success-text',
  warning: 'text-warning-text',
  error: 'text-error-text',
  info: 'text-info-text',
};
const HEADINGS: TextVariant[] = ['display', 'title', 'h2', 'h3'];

/** Nestovin type scale: Manrope for headings, Inter for body. Headings are announced as headers. */
export function Text({
  variant = 'body',
  tone = 'default',
  className = '',
  children,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: TextTone; className?: string; children?: ReactNode }) {
  return (
    <RNText
      accessibilityRole={HEADINGS.includes(variant) ? 'header' : rest.accessibilityRole}
      maxFontSizeMultiplier={variant === 'display' || variant === 'title' ? 1.6 : 2}
      {...rest}
      className={`${VARIANT[variant]} ${tone === 'default' && HEADINGS.includes(variant) ? 'text-charcoal' : TONE[tone]} ${className}`}
    >
      {children}
    </RNText>
  );
}
