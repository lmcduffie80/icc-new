/**
 * ZIP code geocoding utility.
 * Uses Google Maps Geocoding API when GOOGLE_MAPS_API_KEY is configured,
 * falling back to the local ZIP prefix table otherwise.
 *
 * Server-only — never import this in client components.
 */

import { zipToLatLng } from '@/lib/zip-to-latlong';

interface GoogleGeocodeResponse {
  results: Array<{
    geometry: {
      location: { lat: number; lng: number };
    };
  }>;
  status: string;
}

/**
 * Resolve a US ZIP code to precise lat/lng coordinates.
 * Geocodes via Google Maps API when available; falls back to the
 * built-in 3-digit prefix table (±50–100 miles) if not.
 */
export async function geocodeZip(
  zip: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return zipToLatLng(zip);
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', zip);
    url.searchParams.set('components', 'country:US');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return zipToLatLng(zip);
    }

    const data = (await res.json()) as GoogleGeocodeResponse;
    const loc = data.results?.[0]?.geometry?.location;

    if (!loc) {
      return zipToLatLng(zip);
    }

    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return zipToLatLng(zip);
  }
}
