/**
 * Token values for non-CSS consumers (React Native theme, charts).
 * Single source: `tokens.json` (also read directly by the CommonJS Tailwind
 * preset in `packages/ui-native`). `tokens.css` mirrors these for the web.
 */
import tokens from './tokens.json';

export const colors = tokens.colors;
export const radius = tokens.radius;
export const spacing = tokens.spacing;
export const fonts = tokens.fonts;
export default tokens;
