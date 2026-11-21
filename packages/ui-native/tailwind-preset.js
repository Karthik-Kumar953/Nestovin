/**
 * Nestovin Tailwind preset for NativeWind (Resident and Worker apps).
 * Values mirror docs/Design/DESIGN.md and packages/design-tokens. Change them there first.
 * Fonts are registered per weight by the app (@expo-google-fonts), so each weight is its own family.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#00897B', green: '#43A047' },
        teal: { DEFAULT: '#00796B', deep: '#00695C', 50: '#F0F8F6', 100: '#E6F4F1', 200: '#CCE9E4', 300: '#99D3C9' },
        green: { action: '#2E7D32' },
        charcoal: '#111827',
        mint: '#F5FAF9',
        surface: { DEFAULT: '#FFFFFF', subtle: '#F1F5F9' },
        ink: { DEFAULT: '#1F2937', 2: '#4B5563', 3: '#9CA3AF' },
        line: '#E5E7EB',
        success: { DEFAULT: '#22C55E', text: '#166534', surface: '#DCFCE7' },
        warning: { DEFAULT: '#F59E0B', text: '#92400E', surface: '#FEF3C7' },
        error: { DEFAULT: '#EF4444', text: '#B91C1C', surface: '#FEE2E2' },
        info: { DEFAULT: '#3B82F6', text: '#1D4ED8', surface: '#DBEAFE' },
        highlight: '#8B5CF6',
      },
      fontFamily: {
        display: ['Manrope_700Bold'],
        'display-semi': ['Manrope_600SemiBold'],
        'display-x': ['Manrope_800ExtraBold'],
        body: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      fontSize: {
        title: ['30px', { lineHeight: '38px' }],
        h2: ['24px', { lineHeight: '32px' }],
        h3: ['20px', { lineHeight: '28px' }],
        lead: ['18px', { lineHeight: '26px' }],
        body: ['16px', { lineHeight: '24px' }],
        sm: ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
        metric: ['28px', { lineHeight: '36px' }],
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px', '2xl': '28px' },
      spacing: { gutter: '20px' },
    },
  },
};
