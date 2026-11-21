import * as Location from 'expo-location';

export type Fix =
  | { status: 'ok'; lat: number; lng: number; accuracyM: number | undefined }
  | { status: 'denied' | 'off' | 'unavailable' };

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * One location reading for a check-in event (ADR-014: evidence at the event
 * only, never continuous tracking). Falls back to a recent last-known fix if a
 * fresh one takes too long indoors. Never throws.
 */
export async function oneShotLocation(timeoutMs = 10_000): Promise<Fix> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { status: 'denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { status: 'off' };
    const fresh = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs);
    const pos = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 120_000 }));
    if (!pos) return { status: 'unavailable' };
    return { status: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined };
  } catch {
    return { status: 'unavailable' };
  }
}
