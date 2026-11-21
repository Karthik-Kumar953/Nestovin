import type { Config } from 'tailwindcss';
import { colors, radius } from '@nestovin/design-tokens';
import { ext } from './src/ui/theme';

/**
 * Nestovin tokens (docs/Design/DESIGN.md via @nestovin/design-tokens) as the
 * Tailwind theme. Mint tints (src/ui/theme.ts `ext`) are the only colour
 * additions. `fontSize` is the app's type scale: use these names, never
 * arbitrary `text-[NNpx]` sizes.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  // Light mode only (Mobile_Design_System.md); 'class' so nothing follows the OS theme.
  darkMode: 'class',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        charcoal: colors.charcoal,
        canvas: colors.background,
        surface: colors.surface,
        subtle: colors.surfaceSubtle,
        teal: { DEFAULT: colors.tealAction, action: colors.tealAction, deep: colors.tealDeep, brand: colors.primary, ink: ext.tealInk },
        green: { action: colors.greenAction, brand: colors.secondary },
        ink: { DEFAULT: colors.textPrimary, secondary: colors.textSecondary, muted: colors.textMuted },
        line: colors.border,
        mint: { DEFAULT: ext.teal100, strong: ext.teal200, soft: ext.teal50 },
        success: { DEFAULT: colors.success, text: colors.successText, surface: colors.successSurface },
        warning: { DEFAULT: colors.warning, text: colors.warningText, surface: colors.warningSurface },
        error: { DEFAULT: colors.error, text: colors.errorText, surface: colors.errorSurface },
        info: { DEFAULT: colors.info, text: colors.infoText, surface: colors.infoSurface },
      },
      borderRadius: { sm: `${radius.sm}px`, md: `${radius.md}px`, lg: `${radius.lg}px`, xl: `${radius.xl}px`, '2xl': '28px' },
      // Worker type scale (DESIGN.md + Mobile_Design_System.md). Body stays text-base (16/24).
      fontSize: {
        caption: ['12px', { lineHeight: '16px' }],
        label: ['13px', { lineHeight: '18px' }],
        'body-sm': ['15px', { lineHeight: '22px' }],
        lead: ['17px', { lineHeight: '24px' }],
        stat: ['22px', { lineHeight: '28px' }],
        'title-android': ['28px', { lineHeight: '36px' }],
        title: ['30px', { lineHeight: '38px' }],
        metric: ['34px', { lineHeight: '42px' }],
        hero: ['38px', { lineHeight: '46px' }],
      },
      fontFamily: {
        display: ['Manrope_800ExtraBold'],
        heading: ['Manrope_700Bold'],
        title: ['Manrope_600SemiBold'],
        body: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
      },
    },
  },
  plugins: [],
} satisfies Config;
