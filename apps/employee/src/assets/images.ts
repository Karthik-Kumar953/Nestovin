import type { ImageSourcePropType } from 'react-native';
import { GENERATED_IMAGES } from './images.generated';

/**
 * Image registry keyed to docs/Design/Image_Shot_List.md file names (without
 * extension). Run `node scripts/sync-images.cjs` after the owner adds images to
 * docs/Design/images; anything still missing renders a designed fallback.
 */
export type ImageName = keyof typeof GENERATED_IMAGES;

export function imageSource(name: ImageName): ImageSourcePropType | null {
  return (GENERATED_IMAGES as Record<ImageName, ImageSourcePropType | null>)[name] ?? null;
}

/** Which service photo to use for a service name (V1: Maid, Cook, Caretaker only). */
export function serviceKind(serviceName: string): 'maid' | 'cook' | 'caretaker' {
  const n = serviceName.toLowerCase();
  if (n.includes('cook')) return 'cook';
  if (n.includes('care')) return 'caretaker';
  return 'maid';
}
export const servicePhoto = (serviceName: string): ImageName => `svc-${serviceKind(serviceName)}` as ImageName;
export const trainingPhoto = (index: number): ImageName => `wrk-training-${(index % 3) + 1}` as ImageName;

/** The supplied Nestovin mark (docs/Design/Nestovin_logo.png). Never recoloured or stretched. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const LOGO = require('../../assets/brand/logo.png') as number;
