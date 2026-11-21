import { useWindowDimensions } from 'react-native';
import { demoMode } from '../lib/env';

/** DEV-ONLY review aid: ?textscale=2 on the web demo forces the large-text layouts (web has no system font scale). */
const demoLargeText =
  demoMode && /[?&]textscale=2/.test((globalThis as { location?: { search?: string } }).location?.search ?? '');

/**
 * True when the system text size is above 1.3× (Mobile_Design_System.md):
 * side-by-side rows switch to stacks so nothing truncates up to 200%.
 */
export function useLargeText(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale > 1.3 || demoLargeText;
}

/** Cap for digits in fixed grids (calendar, week strip); their full date is in the accessibility label. */
export const GRID_MAX_FONT_SCALE = 1.4;
