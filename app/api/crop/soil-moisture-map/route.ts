/**
 * GET /api/crop/soil-moisture-map
 *
 * Returns soil moisture conditions for all continental US states, used to
 * color-code the USMap component.
 *
 * Previously used NASA SMAP (cloud.csiss.gmu.edu) which required 240+
 * parallel requests and returned ServerBusy errors under even light load.
 *
 * Now uses Open-Meteo in a SINGLE batched request for all 48 state centroids.
 * Open-Meteo supports comma-separated lat/lng lists with no rate limit or
 * API key. Results are the same SoilMoisture shape as before.
 *
 * Results are cached in-memory for 4 hours.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';
import { interpretMoisture, type SoilMoisture } from '@/lib/smap';

export type SoilMoistureMapData = {
  /** keyed by two-letter state abbreviation */
  states: Record<string, SoilMoisture>;
  fetchedAt: number;
};

// ─── State centroids (approximate geographic centers) ─────────────────────────

/** [abbreviation, fips, lat, lng] for all 48 continental US states */
const STATES: [string, string, number, number][] = [
  ['AL', '01',  32.8,  -86.8], ['AZ', '04',  34.2, -111.1], ['AR', '05',  35.0,  -92.4],
  ['CA', '06',  36.8, -119.4], ['CO', '08',  39.0, -105.5], ['CT', '09',  41.6,  -72.7],
  ['DC', '11',  38.9,  -77.0], ['DE', '10',  39.0,  -75.5], ['FL', '12',  27.8,  -81.6],
  ['GA', '13',  32.6,  -83.4], ['ID', '16',  44.2, -114.5], ['IL', '17',  40.0,  -89.2],
  ['IN', '18',  40.3,  -86.1], ['IA', '19',  42.0,  -93.5], ['KS', '20',  38.5,  -98.4],
  ['KY', '21',  37.5,  -85.3], ['LA', '22',  31.2,  -92.4], ['ME', '23',  44.7,  -69.4],
  ['MD', '24',  39.0,  -76.8], ['MA', '25',  42.2,  -71.5], ['MI', '26',  44.3,  -85.4],
  ['MN', '27',  46.4,  -93.1], ['MS', '28',  32.7,  -89.7], ['MO', '29',  38.5,  -92.5],
  ['MT', '30',  47.0, -109.6], ['NE', '31',  41.5,  -99.9], ['NV', '32',  39.3, -116.6],
  ['NH', '33',  43.5,  -71.6], ['NJ', '34',  40.1,  -74.7], ['NM', '35',  34.5, -106.1],
  ['NY', '36',  42.9,  -75.5], ['NC', '37',  35.5,  -79.4], ['ND', '38',  47.5, -100.5],
  ['OH', '39',  40.4,  -82.8], ['OK', '40',  35.6,  -97.5], ['OR', '41',  43.9, -120.6],
  ['PA', '42',  40.6,  -77.2], ['RI', '44',  41.7,  -71.5], ['SC', '45',  33.8,  -80.9],
  ['SD', '46',  44.4, -100.2], ['TN', '47',  35.9,  -86.7], ['TX', '48',  31.2,  -99.3],
  ['UT', '49',  39.3, -111.1], ['VT', '50',  44.1,  -72.7], ['VA', '51',  37.5,  -79.0],
  ['WA', '53',  47.4, -120.5], ['WV', '54',  38.6,  -80.6], ['WI', '55',  44.3,  -89.8],
  ['WY', '56',  42.9, -107.6],
];

interface OpenMeteoResult {
  current?: {
    soil_moisture_1_to_3cm?: number;
    soil_moisture_3_to_9cm?: number;
  };
}

/**
 * Fetch soil moisture for all 48 continental states in ONE Open-Meteo batch
 * request. Open-Meteo accepts comma-separated lat/lng lists and returns an
 * array of per-location result objects — no concurrency issues, no API key.
 */
async function fetchNationalMoisture(): Promise<Record<string, SoilMoisture>> {
  const lats = STATES.map(([, , lat]) => lat.toFixed(2)).join(',');
  const lngs = STATES.map(([, , , lng]) => lng.toFixed(2)).join(',');

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lats);
  url.searchParams.set('longitude', lngs);
  url.searchParams.set('current', 'soil_moisture_1_to_3cm,soil_moisture_3_to_9cm');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 14400 }, // 4-hour CDN cache for this batch
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo error: ${res.status} ${res.statusText}`);
  }

  const raw: unknown = await res.json();
  const results: OpenMeteoResult[] = Array.isArray(raw) ? raw : [raw as OpenMeteoResult];

  const states: Record<string, SoilMoisture> = {};
  const today = new Date().toISOString().slice(0, 10);

  STATES.forEach(([abbr, fips], i) => {
    const r = results[i];
    const m1 = r?.current?.soil_moisture_1_to_3cm;
    const m2 = r?.current?.soil_moisture_3_to_9cm;
    const mean =
      m1 != null && m2 != null ? (m1 + m2) / 2
      : m1 ?? m2 ?? null;

    if (mean == null || !Number.isFinite(mean)) return;

    const { condition, conditionLabel } = interpretMoisture(mean);
    states[abbr] = {
      mean,
      median: mean, // Open-Meteo only provides a single value per point
      condition,
      conditionLabel,
      layerDate: today,
      fips,
    };
  });

  return states;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cache: { data: SoilMoistureMapData; expiresAt: number } | null = null;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, stale-while-revalidate=3600',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const states = await fetchNationalMoisture();
    const data: SoilMoistureMapData = { states, fetchedAt: Date.now() };
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, stale-while-revalidate=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const msg = error instanceof Error ? error.message : 'Failed to fetch soil moisture data';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
