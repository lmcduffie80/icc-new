/**
 * Approximate lat/lng centroids for US states, used as fallback when
 * a precise ZIP-level geocode is unavailable.
 *
 * For soil temperature lookups, state-level accuracy is sufficient —
 * soil temps vary more by date/season than by precise location within a state.
 */

const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AL: { lat: 32.8, lng: -86.8 },
  AR: { lat: 34.8, lng: -92.2 },
  AZ: { lat: 34.3, lng: -111.1 },
  CA: { lat: 36.8, lng: -119.4 },
  CO: { lat: 39.0, lng: -105.5 },
  CT: { lat: 41.6, lng: -72.7 },
  DE: { lat: 38.9, lng: -75.5 },
  FL: { lat: 27.8, lng: -81.7 },
  GA: { lat: 32.7, lng: -83.4 },
  IA: { lat: 42.1, lng: -93.2 },
  ID: { lat: 44.4, lng: -114.5 },
  IL: { lat: 40.0, lng: -89.2 },
  IN: { lat: 39.9, lng: -86.3 },
  KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.5, lng: -85.3 },
  LA: { lat: 31.2, lng: -91.8 },
  MA: { lat: 42.2, lng: -71.5 },
  MD: { lat: 39.0, lng: -76.8 },
  ME: { lat: 45.4, lng: -69.0 },
  MI: { lat: 44.3, lng: -85.4 },
  MN: { lat: 46.4, lng: -93.1 },
  MO: { lat: 38.5, lng: -92.5 },
  MS: { lat: 32.7, lng: -89.7 },
  MT: { lat: 47.0, lng: -110.5 },
  NC: { lat: 35.6, lng: -79.8 },
  ND: { lat: 47.5, lng: -100.5 },
  NE: { lat: 41.5, lng: -99.9 },
  NH: { lat: 43.7, lng: -71.6 },
  NJ: { lat: 40.1, lng: -74.5 },
  NM: { lat: 34.3, lng: -106.0 },
  NV: { lat: 39.5, lng: -116.9 },
  NY: { lat: 42.9, lng: -75.5 },
  OH: { lat: 40.4, lng: -82.8 },
  OK: { lat: 35.6, lng: -97.5 },
  OR: { lat: 44.6, lng: -122.1 },
  PA: { lat: 40.6, lng: -77.2 },
  RI: { lat: 41.7, lng: -71.6 },
  SC: { lat: 33.9, lng: -80.9 },
  SD: { lat: 44.4, lng: -100.2 },
  TN: { lat: 35.9, lng: -86.4 },
  TX: { lat: 31.5, lng: -99.3 },
  UT: { lat: 39.3, lng: -111.1 },
  VA: { lat: 37.5, lng: -78.9 },
  VT: { lat: 44.1, lng: -72.7 },
  WA: { lat: 47.4, lng: -120.6 },
  WI: { lat: 44.3, lng: -89.8 },
  WV: { lat: 38.6, lng: -80.6 },
  WY: { lat: 43.0, lng: -107.6 },
};

/**
 * Map of 3-digit ZIP prefix to approximate lat/lng centroid.
 * Covers major agricultural ZIP prefixes across the US.
 * Accuracy: ±50-100 miles — sufficient for soil temperature lookups.
 */
const ZIP3_TO_LATLONG: Record<string, { lat: number; lng: number }> = {
  // Southeast
  '300': { lat: 33.7, lng: -84.4 }, // Atlanta GA
  '310': { lat: 32.4, lng: -83.7 }, // Macon GA
  '320': { lat: 30.3, lng: -81.7 }, // Jacksonville FL
  '350': { lat: 33.5, lng: -86.8 }, // Birmingham AL
  '360': { lat: 32.4, lng: -86.3 }, // Montgomery AL
  '370': { lat: 36.2, lng: -86.8 }, // Nashville TN
  '380': { lat: 35.1, lng: -89.9 }, // Memphis TN
  '390': { lat: 32.3, lng: -90.2 }, // Jackson MS
  '395': { lat: 30.4, lng: -89.1 }, // Biloxi MS
  // South Central
  '700': { lat: 29.9, lng: -90.1 }, // New Orleans LA
  '710': { lat: 32.5, lng: -92.1 }, // Monroe LA
  '720': { lat: 34.7, lng: -92.3 }, // Little Rock AR
  '730': { lat: 35.5, lng: -97.5 }, // Oklahoma City OK
  '740': { lat: 36.2, lng: -95.9 }, // Tulsa OK
  '750': { lat: 32.8, lng: -97.0 }, // Dallas TX
  '760': { lat: 32.7, lng: -97.3 }, // Fort Worth TX
  '770': { lat: 29.8, lng: -95.4 }, // Houston TX
  '780': { lat: 29.4, lng: -98.5 }, // San Antonio TX
  '790': { lat: 31.8, lng: -102.3 }, // Midland TX
  // Midwest
  '460': { lat: 39.8, lng: -86.2 }, // Indianapolis IN
  '470': { lat: 41.1, lng: -85.1 }, // Fort Wayne IN
  '480': { lat: 42.3, lng: -83.0 }, // Detroit MI
  '490': { lat: 42.3, lng: -85.2 }, // Kalamazoo MI
  '500': { lat: 41.6, lng: -93.6 }, // Des Moines IA
  '510': { lat: 42.5, lng: -92.3 }, // Waterloo IA
  '520': { lat: 41.5, lng: -90.6 }, // Davenport IA
  '530': { lat: 43.0, lng: -87.9 }, // Milwaukee WI
  '540': { lat: 44.5, lng: -88.0 }, // Green Bay WI
  '550': { lat: 44.9, lng: -93.2 }, // Minneapolis MN
  '560': { lat: 44.1, lng: -94.0 }, // Mankato MN
  '570': { lat: 43.5, lng: -96.7 }, // Sioux Falls SD
  '580': { lat: 46.9, lng: -96.8 }, // Fargo ND
  '590': { lat: 45.8, lng: -108.5 }, // Billings MT
  '600': { lat: 41.9, lng: -87.6 }, // Chicago IL
  '610': { lat: 40.7, lng: -89.6 }, // Peoria IL
  '620': { lat: 39.8, lng: -89.6 }, // Springfield IL
  '630': { lat: 38.6, lng: -90.2 }, // St. Louis MO
  '640': { lat: 39.1, lng: -94.6 }, // Kansas City MO
  '650': { lat: 37.2, lng: -93.3 }, // Springfield MO
  '660': { lat: 37.7, lng: -97.3 }, // Wichita KS
  '670': { lat: 39.0, lng: -96.8 }, // Topeka KS
  '680': { lat: 41.3, lng: -96.0 }, // Omaha NE
  '690': { lat: 40.8, lng: -99.4 }, // Kearney NE
  // Mid-Atlantic / Northeast
  '150': { lat: 40.4, lng: -80.0 }, // Pittsburgh PA
  '170': { lat: 40.3, lng: -76.9 }, // Harrisburg PA
  '190': { lat: 39.9, lng: -75.2 }, // Philadelphia PA
  '200': { lat: 38.9, lng: -77.0 }, // Washington DC
  '210': { lat: 39.3, lng: -76.6 }, // Baltimore MD
  '220': { lat: 38.8, lng: -77.1 }, // Northern VA
  '240': { lat: 37.3, lng: -79.9 }, // Roanoke VA
  '250': { lat: 38.4, lng: -81.6 }, // Charleston WV
  // Carolinas
  '270': { lat: 36.1, lng: -79.8 }, // Greensboro NC
  '280': { lat: 35.2, lng: -80.8 }, // Charlotte NC
  '290': { lat: 33.0, lng: -80.0 }, // Charleston SC
  // Ohio
  '430': { lat: 39.9, lng: -82.8 }, // Columbus OH
  '440': { lat: 41.5, lng: -81.7 }, // Cleveland OH
  '450': { lat: 39.1, lng: -84.5 }, // Cincinnati OH
  // Mountain West
  '800': { lat: 39.7, lng: -104.9 }, // Denver CO
  '810': { lat: 38.8, lng: -104.8 }, // Colorado Springs CO
  '820': { lat: 41.1, lng: -104.8 }, // Cheyenne WY
  '830': { lat: 43.5, lng: -112.0 }, // Pocatello ID
  '840': { lat: 40.8, lng: -111.9 }, // Salt Lake City UT
  '850': { lat: 33.4, lng: -112.1 }, // Phoenix AZ
  '860': { lat: 35.2, lng: -111.6 }, // Flagstaff AZ
  '870': { lat: 35.1, lng: -106.6 }, // Albuquerque NM
  // West Coast
  '900': { lat: 34.1, lng: -118.2 }, // Los Angeles CA
  '930': { lat: 36.7, lng: -119.8 }, // Fresno CA
  '940': { lat: 37.8, lng: -122.3 }, // San Francisco CA
  '970': { lat: 45.5, lng: -122.7 }, // Portland OR
  '980': { lat: 47.6, lng: -122.3 }, // Seattle WA
  '990': { lat: 47.7, lng: -117.4 }, // Spokane WA
};

import { zipToState } from '@/lib/zip-to-state';

/**
 * Convert a ZIP code to approximate lat/lng coordinates.
 * Uses ZIP prefix lookup first, then falls back to state centroid.
 */
export function zipToLatLng(zip: string): { lat: number; lng: number } | null {
  if (!zip || zip.length < 3) return null;

  const prefix3 = zip.substring(0, 3);
  if (ZIP3_TO_LATLONG[prefix3]) {
    return ZIP3_TO_LATLONG[prefix3];
  }

  // Fall back to state centroid
  const state = zipToState(zip);
  if (state && STATE_CENTROIDS[state]) {
    return STATE_CENTROIDS[state];
  }

  return null;
}
