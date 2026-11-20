/** Token values for non-CSS consumers (React Native theme, charts). Mirrors tokens.css. */
export const colors = {
  primary: '#00897B',
  secondary: '#43A047',
  charcoal: '#111827',
  background: '#F5FAF9',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  tealAction: '#00796B',
  tealDeep: '#00695C',
  greenAction: '#2E7D32',
  textPrimary: '#1F2937',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  success: '#22C55E',
  successText: '#166534',
  successSurface: '#DCFCE7',
  warning: '#F59E0B',
  warningText: '#92400E',
  warningSurface: '#FEF3C7',
  error: '#EF4444',
  errorText: '#B91C1C',
  errorSurface: '#FEE2E2',
  info: '#3B82F6',
  infoText: '#1D4ED8',
  infoSurface: '#DBEAFE',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 } as const;
export const fonts = { heading: 'Manrope', body: 'Inter' } as const;
