/**
 * Fields of the World (FTW) utilities
 *
 * FTW is a global dataset of 3.17 billion agricultural field boundaries
 * derived from Sentinel-2 satellite imagery via ML (PRUE model).
 *
 * Data source: https://fieldsofthe.world
 * License: CC-BY-4.0, Taylor Geospatial / Microsoft AI for Good
 *
 * PMTiles are served directly from Source Cooperative — only the tiles
 * needed for the current viewport are fetched (HTTP range requests).
 */

const FTW_BASE =
  'https://data.source.coop/ftw/global-data/predictions/vectors/alpha/results-by-admin-conf';

/** Build the PMTiles URL for a given ISO 3166-1 alpha-2 country code and optional US state code. */
export function ftwPmtilesUrl(countryCode: string, usStateCode?: string): string {
  const cc = countryCode.toUpperCase();
  if (cc === 'US' && usStateCode) {
    return `${FTW_BASE}/admin:country_code=US/US_${usStateCode.toUpperCase()}.pmtiles`;
  }
  return `${FTW_BASE}/admin:country_code=${cc}/${cc}.pmtiles`;
}

/** Nominatim reverse-geocode result (trimmed). */
interface NominatimResult {
  address?: {
    country_code?: string;
    state?: string;
  };
}

/** Map US state names → USPS abbreviation (used in FTW filenames). */
export const US_STATE_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

/**
 * Reverse-geocode a coordinate via our server-side proxy (avoids Nominatim
 * ToS issues with direct browser requests) and return the FTW PMTiles URL.
 * Falls back to the US_GA file if the lookup fails.
 */
export async function getFtwUrl(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`/api/farm/geocode?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json() as { countryCode?: string; stateCode?: string };
    if (data.countryCode) {
      return ftwPmtilesUrl(data.countryCode, data.stateCode);
    }
  } catch {
    // Fallback — default to Georgia which is where the demo field is
  }
  return ftwPmtilesUrl('US', 'GA');
}

/**
 * Reverse-geocode via Nominatim (server-side only — called from the
 * /api/farm/geocode route handler).
 */
export async function nominatimReverseGeocode(
  lat: number,
  lon: number
): Promise<{ countryCode: string; stateCode?: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'innovative-crop-care/1.0 (field-boundary-lookup)',
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult;
    const countryCode = data.address?.country_code?.toUpperCase();
    if (!countryCode) return null;

    let stateCode: string | undefined;
    if (countryCode === 'US' && data.address?.state) {
      stateCode = US_STATE_ABBR[data.address.state];
    }
    return { countryCode, stateCode };
  } catch {
    return null;
  }
}
