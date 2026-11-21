import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingOptions, ResidenceRegistrationResult, ResidentMe } from '@nestovin/contracts';
import { api } from './api';

export type NotOpenReason = NonNullable<BookingOptions['reasonCode']> | 'UNKNOWN';

/** Why booking is closed for this resident (server reasonCode; UNKNOWN only for an unexpected response). */
export const bookingNotOpenReason = (o: BookingOptions): NotOpenReason => o.reasonCode ?? 'UNKNOWN';

/**
 * New upload target for the caller's PENDING registration whose document never arrived
 * (same document id, fresh storage key and token). The API answers 409 if the review is already
 * decided or the document is already uploaded; that message is shown as is.
 */
export const requestReupload = (document: {
  docType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) =>
  api<ResidenceRegistrationResult>('/v1/resident/residence/document', {
    method: 'POST',
    body: { document },
  });

export interface RememberedFlat {
  cityId?: string;
  cityName?: string;
  communityId: string;
  communityName: string;
  towerId?: string;
  towerName: string;
  flatId: string;
  flatNumber: string;
  occupancy: 'OWNER' | 'TENANT' | 'FAMILY';
}
const KEY = 'nestovin.lastRegistration';

/**
 * The flat of a rejected registration, for prefilling the proof step. The server's copy
 * (me.verification.flat) wins; this device's last submission is only a fallback, and it is the only
 * source of the city and tower ids, which let the resident go back and change the flat.
 */
export async function rejectedFlat(me: ResidentMe | undefined): Promise<RememberedFlat | null> {
  const server = me?.verification?.flat ?? null;
  const local = await recallFlat();
  if (server) {
    const same = local?.flatId === server.flatId ? local : null;
    return { ...server, cityId: same?.cityId, cityName: same?.cityName, towerId: same?.towerId };
  }
  return local;
}

export const rememberFlat = (f: RememberedFlat) =>
  AsyncStorage.setItem(KEY, JSON.stringify(f)).catch(() => undefined);

async function recallFlat(): Promise<RememberedFlat | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RememberedFlat) : null;
  } catch {
    return null;
  }
}
