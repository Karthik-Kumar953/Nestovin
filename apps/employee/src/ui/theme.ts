import { colors as tokens } from '@nestovin/design-tokens';

/**
 * Worker-app additions on top of @nestovin/design-tokens (DESIGN.md). Only
 * values with no token equivalent live here. Tint names match the shared
 * mobile extensions (packages/ui-native/src/extensions.json) so a later move
 * to the shared preset is mechanical. Also read by tailwind.config.ts.
 */
export const ext = {
  /** Lighter steps of brand teal for mint and selected surfaces. */
  teal50: '#F0F8F6',
  teal100: '#E6F4F1',
  teal200: '#CCE9E4',
  /** Deep brand teal from the Admin Portal shell: dark bands, scrims and shadows (the only allowed extension). */
  tealInk: '#0B3B36',
  white: '#FFFFFF',
} as const;

/** Token values for props that cannot take a className (icons, gradients, native chrome). */
export const c = {
  ...tokens,
  ...ext,
  mint: ext.teal100,
  mintStrong: ext.teal200,
  mintSoft: ext.teal50,
  /** iOS shadow colour (opacity is set per shadow). */
  shadow: ext.tealInk,
} as const;

/** Brand gradients (teal family only; no coloured glow). */
export const gradients = {
  hero: [tokens.tealDeep, tokens.tealAction, tokens.primary] as const,
  mint: [ext.teal50, ext.teal100] as const,
  mintStrong: [ext.teal100, ext.teal200] as const,
  success: [tokens.surface, tokens.successSurface] as const,
  warning: [tokens.surface, tokens.warningSurface] as const,
  error: [tokens.surface, tokens.errorSurface] as const,
  /** Bottom scrim over photos so white text stays readable (teal ink #0B3B36). */
  scrim: ['rgba(11,59,54,0)', 'rgba(11,59,54,0.72)'] as const,
  scrimSoft: ['rgba(11,59,54,0.05)', 'rgba(11,59,54,0.55)'] as const,
  /** Welcome photo scrim: light at the top, near-solid teal ink behind the buttons. */
  welcome: ['rgba(11,59,54,0.15)', 'rgba(11,59,54,0.55)', 'rgba(11,59,54,0.96)'] as const,
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
  teal: { bg: ext.teal100, fg: tokens.tealDeep, dot: tokens.tealAction },
};
