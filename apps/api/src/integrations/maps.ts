/** Google Maps Geocoding (server-side; the key never reaches the browser). */
export interface Geocoder {
  geocode(address: string): Promise<{ lat: number; lng: number; formattedAddress: string }[]>;
}

export function createGoogleGeocoder(apiKey: string): Geocoder {
  return {
    async geocode(address) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('region', 'in');
      url.searchParams.set('key', apiKey);
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as { status: string; results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[]; error_message?: string };
      if (json.status === 'ZERO_RESULTS') return [];
      if (json.status !== 'OK') throw new Error(`Geocoding failed: ${json.status}`);
      return (json.results ?? []).slice(0, 5).map((r) => ({ lat: r.geometry.location.lat, lng: r.geometry.location.lng, formattedAddress: r.formatted_address }));
    },
  };
}
