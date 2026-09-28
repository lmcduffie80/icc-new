/**
 * lib/smap.ts
 *
 * NASA SMAP satellite soil moisture data via the Crop-CASMA WPS API.
 * Endpoint: https://cloud.csiss.gmu.edu/smap_service
 * No API key required. Data is 9 km resolution, updated daily (1–3 day lag).
 *
 * Scale: volumetric water content (m³/m³)
 *   < 0.10 → drought
 *   0.10–0.20 → dry
 *   0.20–0.30 → normal
 *   0.30–0.40 → moist
 *   > 0.40 → saturated
 */

export type MoistureCondition = 'drought' | 'dry' | 'normal' | 'moist' | 'saturated';

export interface SoilMoisture {
  /** Mean volumetric water content (m³/m³) */
  mean: number;
  /** Median volumetric water content (m³/m³) */
  median: number;
  condition: MoistureCondition;
  conditionLabel: string;
  /** YYYY-MM-DD of the SMAP layer used */
  layerDate: string;
  fips: string;
}

// ─── State lookup tables ──────────────────────────────────────────────────────

/** Two-letter abbreviation → FIPS numeric string */
export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06',
  CO: '08', CT: '09', DC: '11', DE: '10', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18',
  IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28',
  MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49',
  VT: '50', VA: '51', WA: '53', WV: '54', WI: '55',
  WY: '56',
};

/** FIPS → two-letter abbreviation (reverse lookup) */
export const FIPS_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([abbr, fips]) => [fips, abbr])
);

/**
 * State geographic centroids (approximate) for nearest-state lookup.
 * [latitude, longitude]
 */
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.8,  -86.8],  AR: [35.0,  -92.4],  AZ: [34.2, -111.1],
  CA: [36.8, -119.4],  CO: [39.0, -105.5],  CT: [41.6,  -72.7],
  DC: [38.9,  -77.0],  DE: [39.0,  -75.5],  FL: [27.8,  -81.6],
  GA: [32.6,  -83.4],  ID: [44.2, -114.5],  IL: [40.0,  -89.2],
  IN: [40.3,  -86.1],  IA: [42.0,  -93.5],  KS: [38.5,  -98.4],
  KY: [37.5,  -85.3],  LA: [31.2,  -92.4],  ME: [44.7,  -69.4],
  MD: [39.0,  -76.8],  MA: [42.2,  -71.5],  MI: [44.3,  -85.4],
  MN: [46.4,  -93.1],  MS: [32.7,  -89.7],  MO: [38.5,  -92.5],
  MT: [47.0, -109.6],  NE: [41.5,  -99.9],  NV: [39.3, -116.6],
  NH: [43.5,  -71.6],  NJ: [40.1,  -74.7],  NM: [34.5, -106.1],
  NY: [42.9,  -75.5],  NC: [35.5,  -79.4],  ND: [47.5, -100.5],
  OH: [40.4,  -82.8],  OK: [35.6,  -97.5],  OR: [43.9, -120.6],
  PA: [40.6,  -77.2],  RI: [41.7,  -71.5],  SC: [33.8,  -80.9],
  SD: [44.4, -100.2],  TN: [35.9,  -86.7],  TX: [31.2,  -99.3],
  UT: [39.3, -111.1],  VT: [44.1,  -72.7],  VA: [37.5,  -79.0],
  WA: [47.4, -120.5],  WV: [38.6,  -80.6],  WI: [44.3,  -89.8],
  WY: [42.9, -107.6],
};

/**
 * Approximate state detection from lat/lng using nearest-centroid.
 * Returns FIPS string or null if no match found.
 */
export function latLngToStateFips(lat: number, lng: number): string | null {
  let minDist = Infinity;
  let closest: string | null = null;

  for (const [abbr, [cLat, cLng]] of Object.entries(STATE_CENTROIDS)) {
    const d = Math.sqrt((lat - cLat) ** 2 + (lng - cLng) ** 2);
    if (d < minDist) {
      minDist = d;
      closest = abbr;
    }
  }

  return closest ? (STATE_FIPS[closest] ?? null) : null;
}

// ─── Moisture interpretation ──────────────────────────────────────────────────

export function interpretMoisture(mean: number): {
  condition: MoistureCondition;
  conditionLabel: string;
} {
  if (mean < 0.10) return { condition: 'drought',   conditionLabel: 'Drought'   };
  if (mean < 0.20) return { condition: 'dry',        conditionLabel: 'Dry'       };
  if (mean < 0.30) return { condition: 'normal',     conditionLabel: 'Normal'    };
  if (mean < 0.40) return { condition: 'moist',      conditionLabel: 'Moist'     };
  return               { condition: 'saturated', conditionLabel: 'Saturated' };
}

/** Tailwind color classes for each moisture condition (used by USMap) */
export const MOISTURE_COLORS: Record<MoistureCondition, { fill: string; hover: string; badge: string }> = {
  drought:   { fill: 'fill-red-500',     hover: 'hover:fill-red-600',     badge: 'bg-red-100 text-red-700 border-red-200'    },
  dry:       { fill: 'fill-orange-400',  hover: 'hover:fill-orange-500',  badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  normal:    { fill: 'fill-emerald-400', hover: 'hover:fill-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  moist:     { fill: 'fill-blue-400',    hover: 'hover:fill-blue-500',    badge: 'bg-blue-100 text-blue-700 border-blue-200'  },
  saturated: { fill: 'fill-blue-700',    hover: 'hover:fill-blue-800',    badge: 'bg-blue-200 text-blue-900 border-blue-300'  },
};

// ─── SMAP WPS fetcher ─────────────────────────────────────────────────────────

const SMAP_BASE = 'https://cloud.csiss.gmu.edu/smap_service';

// The Crop-CASMA WPS service is a small, free, unauthenticated academic
// endpoint with a very low concurrency ceiling — it returns a 400
// "ServerBusy: Maximum number of parallel running processes reached" error
// under even light concurrent load, and its own response latency for that
// error climbs further the harder we hit it (observed: ~1.2-2.4s for a
// single request vs. ~5s+ when firing many at once). To avoid amplifying
// that problem — and to avoid one flaky external call holding up an entire
// page load of up to 48 states — we cap our own global concurrency to this
// host and use a short per-request timeout so a bad response can't add more
// than a few seconds to any request that depends on it.
// High enough that a single state's 5 day-probes never queue behind each
// other (avoiding compounding their timeouts), while still capping the
// worst-case burst from the 48-state national map pre-fetch to a fraction
// of its unbounded 240-request potential.
const SMAP_MAX_CONCURRENCY = 10;
const SMAP_REQUEST_TIMEOUT_MS = 3_000;
let smapActiveRequests = 0;
const smapWaitQueue: Array<() => void> = [];

function acquireSmapSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (smapActiveRequests < SMAP_MAX_CONCURRENCY) {
        smapActiveRequests++;
        resolve(() => {
          smapActiveRequests--;
          const next = smapWaitQueue.shift();
          if (next) next();
        });
      } else {
        smapWaitQueue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

/**
 * Attempt to fetch SMAP GetStatByFips for a given FIPS and date.
 * Returns null on any failure (bad date, no data, network error, or the
 * upstream service being overloaded).
 */
async function tryFetchSmapLayer(
  fips: string,
  dateStr: string // 'YYYY.MM.DD'
): Promise<{ mean: number; median: number } | null> {
  const layer = `SMAP-9KM-DAILY-SUB_${dateStr}_013000`;
  const params = new URLSearchParams({
    service: 'WPS',
    version: '1.0.0',
    request: 'Execute',
    identifier: 'GetStatByFips',
    DataInputs: `layer=${layer};fips=${fips};minValue=0;maxValue=1;step=0.1`,
  });

  const release = await acquireSmapSlot();
  try {
    const res = await fetch(`${SMAP_BASE}?${params}`, {
      signal: AbortSignal.timeout(SMAP_REQUEST_TIMEOUT_MS),
      // Cache per (layer, fips) for 30 min via Next's Data Cache. The manual
      // in-memory cache below already covers 1hr within a single serverless
      // instance; this covers cross-instance/cold-start requests for the
      // same day+state, which are common since many users query overlapping
      // states within a short window.
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;

    const text = await res.text();
    if (text.includes('ServerBusy') || text.includes('ExceptionReport')) return null;

    // Response format: {'median': 0.26660872, 'mean': 0.26743}
    const medianMatch = text.match(/'median':\s*([\d.]+)/);
    const meanMatch   = text.match(/'mean':\s*([\d.]+)/);

    const mean   = parseFloat(meanMatch?.[1] ?? '');
    const median = parseFloat(medianMatch?.[1] ?? '');

    if (!Number.isFinite(mean)) return null;
    return { mean, median: Number.isFinite(median) ? median : mean };
  } catch {
    return null;
  } finally {
    release();
  }
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const smapCache = new Map<string, { data: SoilMoisture; expiresAt: number }>();
const SMAP_TTL_MS = 60 * 60 * 1000; // 1 hour — SMAP data is daily

/**
 * Fallback: fetch soil moisture from Open-Meteo for a given lat/lng.
 * Used when SMAP is busy or returns no data.
 */
async function fetchSoilMoistureFromOpenMeteo(
  lat: number,
  lng: number,
  fips: string
): Promise<SoilMoisture | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(3));
    url.searchParams.set('longitude', lng.toFixed(3));
    url.searchParams.set('current', 'soil_moisture_1_to_3cm,soil_moisture_3_to_9cm');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      current?: { soil_moisture_1_to_3cm?: number; soil_moisture_3_to_9cm?: number }
    };
    const m1 = data.current?.soil_moisture_1_to_3cm;
    const m2 = data.current?.soil_moisture_3_to_9cm;
    const mean = m1 != null && m2 != null ? (m1 + m2) / 2 : m1 ?? m2 ?? null;
    if (mean == null || !Number.isFinite(mean)) return null;

    const { condition, conditionLabel } = interpretMoisture(mean);
    return {
      mean,
      median: mean,
      condition,
      conditionLabel,
      layerDate: new Date().toISOString().slice(0, 10),
      fips,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch soil moisture for a US state by FIPS code.
 * Tries SMAP satellite data first (most accurate); falls back to Open-Meteo
 * model data if SMAP is busy or returns no data.
 * Results are cached in-memory for 1 hour.
 *
 * @param fips - Two-digit US state FIPS code (e.g. '19' for Iowa)
 * @returns SoilMoisture data or null if unavailable
 */
export async function fetchSoilMoisture(fips: string): Promise<SoilMoisture | null> {
  const cached = smapCache.get(fips);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const today = new Date();
  const candidateDaysAgo = [2, 3, 4, 5, 6];
  const dateStrings = candidateDaysAgo.map((daysAgo) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    // Format as YYYY.MM.DD for the SMAP layer name
    return [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
    ].join('.');
  });

  // Probe all candidate days IN PARALLEL rather than one at a time.
  const attempts = await Promise.all(
    dateStrings.map((dateStr) => tryFetchSmapLayer(fips, dateStr))
  );

  // Prefer the most recent day (smallest daysAgo) that actually has data.
  for (let i = 0; i < attempts.length; i++) {
    const result = attempts[i];
    if (result) {
      const { condition, conditionLabel } = interpretMoisture(result.mean);
      const data: SoilMoisture = {
        mean: result.mean,
        median: result.median,
        condition,
        conditionLabel,
        layerDate: dateStrings[i].replace(/\./g, '-'),
        fips,
      };
      smapCache.set(fips, { data, expiresAt: Date.now() + SMAP_TTL_MS });
      return data;
    }
  }

  // SMAP returned nothing (ServerBusy or no data) — fall back to Open-Meteo.
  // Use the state centroid for the Open-Meteo call.
  const abbr = FIPS_STATE[fips];
  if (abbr && STATE_CENTROIDS[abbr]) {
    const [lat, lng] = STATE_CENTROIDS[abbr];
    const fallback = await fetchSoilMoistureFromOpenMeteo(lat, lng, fips);
    if (fallback) {
      smapCache.set(fips, { data: fallback, expiresAt: Date.now() + SMAP_TTL_MS });
      return fallback;
    }
  }

  return null;
}

/**
 * Fetch soil moisture for multiple states in parallel.
 * Returns a partial map — states with no SMAP data are omitted.
 */
export async function fetchSoilMoistureForStates(
  fipsCodes: string[]
): Promise<Record<string, SoilMoisture>> {
  const results = await Promise.all(
    fipsCodes.map(async (fips) => {
      const data = await fetchSoilMoisture(fips);
      return [fips, data] as [string, SoilMoisture | null];
    })
  );

  return Object.fromEntries(
    results.filter((entry): entry is [string, SoilMoisture] => entry[1] !== null)
  );
}

// ─── Corn Belt FIPS codes (for drought alerts) ────────────────────────────────

/** FIPS codes of major corn-belt + wheat-belt states monitored for drought */
export const CORN_BELT_FIPS = [
  '17', // IL — Illinois
  '18', // IN — Indiana
  '19', // IA — Iowa
  '20', // KS — Kansas
  '27', // MN — Minnesota
  '29', // MO — Missouri
  '31', // NE — Nebraska
  '38', // ND — North Dakota
  '39', // OH — Ohio
  '46', // SD — South Dakota
  '55', // WI — Wisconsin
];

/** FIPS of all 48 continental US states (excludes AK and HI) */
export const CONTINENTAL_FIPS = [
  '01','04','05','06','08','09','10','11','12','13',
  '16','17','18','19','20','21','22','23','24','25',
  '26','27','28','29','30','31','32','33','34','35',
  '36','37','38','39','40','41','42','44','45','46',
  '47','48','49','50','51','53','54','55','56',
];
