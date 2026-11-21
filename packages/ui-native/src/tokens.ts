import { colors as base, radius, spacing } from '@nestovin/design-tokens';
import ext from './extensions.json';

/** Token values for props that cannot take a className (icons, gradients, native controls). */
export const colors = {
  ...base,
  ...ext.tints,
  white: '#FFFFFF',
  scrim: 'rgba(17, 24, 39, 0.45)',
} as const;

export { radius, spacing };

/** Font family per weight (registered by the app with @expo-google-fonts). */
export const fonts = ext.fontFamilies;

/** Brand gradients for heroes and designed image fallbacks. */
export const gradients = {
  brand: ['#00695C', '#00897B', '#43A047'] as const,
  mint: ['#E6F4F1', '#F5FAF9'] as const,
  dusk: ['#0B3B36', '#00695C'] as const,
  sage: ['#00695C', '#2E7D32', '#43A047'] as const,
  scrimBottom: ['rgba(0,0,0,0)', 'rgba(6,30,27,0.78)'] as const,
};

/** Motion tokens (ms). Exits are ~65% of entrances. */
export const motion = {
  fast: 150,
  base: 240,
  slow: 380,
  stagger: 45,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
} as const;

/** Low, warm elevation for genuinely floating surfaces only. */
export const elevation = {
  card: {
    shadowColor: '#0B3B36',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#0B3B36',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;
