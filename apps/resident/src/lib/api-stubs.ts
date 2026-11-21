import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingOptions, ResidenceRegistrationResult, ResidentMe } from '@nestovin/contracts';
import { api, ApiError } from './api';

/*
 * Typed stand-ins for API changes requested from the lead (see the shared notes:
 * resident-app-api-requests-and-adr018.md). Each works with today's API and switches to the
 * new field or route as soon as it ships.
 */

export type NotOpenReason = 'NOT_REGISTERED' | 'NOT_VERIFIED' | 'NO_CATEGORY' | 'COMMUNITY_NOT_LIVE' | 'UNKNOWN';

// TODO(api): booking-options.reasonCode (request 1). Until then, map today's reason strings.
export function bookingNotOpenReason(o: BookingOptions): NotOpenReason {
  const code = (o as BookingOptions & { reasonCode?: NotOpenReason | null }).reasonCode;
  if (code) return code;
  const r = (o.reason ?? '').toLowerCase();
  if (r.includes('register')) return 'NOT_REGISTERED';
  if (r.includes('verification') || r.includes('waiting')) return 'NOT_VERIFIED';
  if (r.includes('category')) return 'NO_CATEGORY';
  if (r.includes('not live') || r.includes('not open') || r.includes('setting up') || r.includes('not active')) return 'COMMUNITY_NOT_LIVE';
  return 'UNKNOWN';
}

// TODO(api): POST /v1/resident/residence/document (request 2) for a PENDING membership whose upload failed.
export async function requestReupload(document: { docType: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<ResidenceRegistrationResult | 'NOT_AVAILABLE'> {
  try {
    return await api<ResidenceRegistrationResult>('/v1/resident/residence/document', { method: 'POST', body: { document } });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return 'NOT_AVAILABLE';
    throw e;
  }
}

export interface RememberedFlat {
  cityId: string;
  cityName: string;
  communityId: string;
  communityName: string;
  towerId: string;
  towerName: string;
  flatId: string;
  flatNumber: string;
  occupancy: 'OWNER' | 'TENANT';
}
const KEY = 'nestovin.lastRegistration';

/** Remembered on this device after each submission, so a rejection can reopen the proof step prefilled. */
export const rememberFlat = (f: RememberedFlat) => AsyncStorage.setItem(KEY, JSON.stringify(f)).catch(() => undefined);
export async function recallFlat(): Promise<RememberedFlat | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RememberedFlat) : null;
  } catch {
    return null;
  }
}

// TODO(api): me.verification.flat (request 3). Prefer the server's copy when present.
export function rejectedFlat(me: ResidentMe | undefined): Partial<RememberedFlat> | null {
  const f = (me?.verification as (ResidentMe['verification'] & { flat?: { flatId: string; flatNumber: string; towerName: string; communityName: string; occupancy: 'OWNER' | 'TENANT' } | null }) | null)?.flat;
  return f ? { flatId: f.flatId, flatNumber: f.flatNumber, towerName: f.towerName, communityName: f.communityName, occupancy: f.occupancy } : null;
}
