import type { IconName } from '@nestovin/ui-native';
import generated from './images.generated';

/**
 * Image registry keyed by the file names in docs/Design/Image_Shot_List.md.
 * Files the owner has generated are copied in by `pnpm images` (scripts/sync-images.cjs), which rewrites
 * images.generated.ts. Anything missing returns null, and <Photo>/<EmptyState> render a designed fallback.
 */
export const SHOT_LIST = [
  'res-onboarding-hero.jpg',
  'onb-verified-staff.jpg',
  'onb-book-services.jpg',
  'onb-track-visits.jpg',
  'reg-step-flat.png',
  'reg-step-occupancy.png',
  'reg-step-proof.png',
  'res-home-hero.jpg',
  'svc-maid.jpg',
  'svc-cook.jpg',
  'svc-caretaker.jpg',
  'community-towers.jpg',
  'worker-lakshmi.jpg',
  'worker-meena.jpg',
  'worker-ravi.jpg',
  'resident-ananya.jpg',
  'ill-verify-review.png',
  'ill-verified.png',
  'ill-rejected.png',
  'ill-payment-success.png',
  'ill-round-joined.png',
  'ill-vote.png',
  'ill-not-live.png',
  'ill-offline.png',
  'ill-empty-visits.png',
  'ill-empty-support.png',
  'ill-checkin-phone.png',
  'ill-visit-done.png',
] as const;

export type ShotName = (typeof SHOT_LIST)[number];

export function img(name: ShotName): number | null {
  return (generated as Partial<Record<ShotName, number>>)[name] ?? null;
}

/** V1 services only: Maid, Cook, Caretaker (matched on the catalogue's service code or name). */
export type ServiceKind = 'maid' | 'cook' | 'caretaker' | 'other';

export function serviceKind(codeOrName: string | null | undefined): ServiceKind {
  const s = (codeOrName ?? '').toLowerCase();
  if (s.includes('cook') || s.includes('chef')) return 'cook';
  if (s.includes('care')) return 'caretaker';
  if (s.includes('maid') || s.includes('clean') || s.includes('house')) return 'maid';
  return 'other';
}

/** `tone` picks the designed fallback gradient while the photo does not exist yet, so the three services look distinct. */
export const SERVICE_VISUAL: Record<
  ServiceKind,
  { photo: ShotName | null; icon: IconName; label: string; tone: 'brand' | 'dusk' | 'sage' }
> = {
  maid: { photo: 'svc-maid.jpg', icon: 'sparkles-outline', label: 'Maid', tone: 'brand' },
  cook: { photo: 'svc-cook.jpg', icon: 'restaurant-outline', label: 'Cook', tone: 'dusk' },
  caretaker: {
    photo: 'svc-caretaker.jpg',
    icon: 'heart-outline',
    label: 'Caretaker',
    tone: 'sage',
  },
  other: { photo: null, icon: 'home-outline', label: 'Service', tone: 'brand' },
};

export const servicePhoto = (codeOrName: string | null | undefined) => {
  const v = SERVICE_VISUAL[serviceKind(codeOrName)];
  return v.photo ? img(v.photo) : null;
};
export const serviceIcon = (codeOrName: string | null | undefined) =>
  SERVICE_VISUAL[serviceKind(codeOrName)].icon;
