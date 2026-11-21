import type { Config } from 'tailwindcss';
import { colors, radius } from '@nestovin/design-tokens';

/**
 * Nestovin tokens (docs/Design/DESIGN.md via @nestovin/design-tokens) as the
 * Tailwind theme. Mint and ink tints are the only additions: they are the
 * brand mint/teal at lower strength for hero and fallback surfaces.
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
        teal: { DEFAULT: colors.tealAction, action: colors.tealAction, deep: colors.tealDeep, brand: colors.primary },
        green: { action: colors.greenAction, brand: colors.secondary },
        ink: { DEFAULT: colors.textPrimary, secondary: colors.textSecondary, muted: colors.textMuted },
        line: colors.border,
        mint: { DEFAULT: '#E6F4F1', strong: '#CDEAE4', soft: '#F0F8F6' },
        success: { DEFAULT: colors.success, text: colors.successText, surface: colors.successSurface },
        warning: { DEFAULT: colors.warning, text: colors.warningText, surface: colors.warningSurface },
        error: { DEFAULT: colors.error, text: colors.errorText, surface: colors.errorSurface },
        info: { DEFAULT: colors.info, text: colors.infoText, surface: colors.infoSurface },
      },
      borderRadius: { sm: `${radius.sm}px`, md: `${radius.md}px`, lg: `${radius.lg}px`, xl: `${radius.xl}px`, '2xl': '28px' },
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
