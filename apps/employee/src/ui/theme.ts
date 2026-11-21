import { colors as tokens } from '@nestovin/design-tokens';

/** Token values for props that cannot take a className (icons, gradients, native chrome). */
export const c = {
  ...tokens,
  mint: '#E6F4F1',
  mintStrong: '#CDEAE4',
  mintSoft: '#F0F8F6',
  white: '#FFFFFF',
} as const;

/** Brand gradients (teal family only; no coloured glow). */
export const gradients = {
  hero: [tokens.tealDeep, tokens.tealAction, '#0A8F80'] as const,
  mint: ['#F0F8F6', '#DDF0EB'] as const,
  success: ['#E8F7EE', '#D2F0DD'] as const,
  warning: ['#FFF8E6', '#FDEFC8'] as const,
  error: ['#FFF1F1', '#FDE0E0'] as const,
};

/** Shared motion tokens (ms). Exits are ~65% of enters. */
export const motion = { fast: 140, base: 220, slow: 360, stagger: 45 } as const;

export type Tone = 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'teal';
export const toneColors: Record<Tone, { bg: string; fg: string; dot: string }> = {
  info: { bg: tokens.infoSurface, fg: tokens.infoText, dot: tokens.info },
  success: { bg: tokens.successSurface, fg: tokens.successText, dot: tokens.success },
  warning: { bg: tokens.warningSurface, fg: tokens.warningText, dot: tokens.warning },
  error: { bg: tokens.errorSurface, fg: tokens.errorText, dot: tokens.error },
  neutral: { bg: tokens.surfaceSubtle, fg: tokens.textSecondary, dot: tokens.textMuted },
  teal: { bg: '#E0F2EF', fg: tokens.tealDeep, dot: tokens.tealAction },
};
