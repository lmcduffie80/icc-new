/**
 * lib/irrigation.ts
 *
 * Field-level irrigation-need heatmap.
 *
 * Builds a small grid of sample points around a farmer's location and
 * computes a 0-100 "irrigation need" index for each point using Open-Meteo's
 * free forecast API (no API key required), batched into a SINGLE
 * multi-location request (Open-Meteo supports comma-separated lat/lng lists
 * and returns one result object per location).
 *
 * The index combines two free, model-derived signals:
 *   - Root-zone soil moisture (1–3cm + 3–9cm depth, volumetric water content)
 *   - 7-day water balance (precipitation received minus reference ET₀)
 *
 * This is a heuristic estimate meant to give growers a quick visual sense of
 * where moisture is lowest across their local area — it is NOT a substitute
 * for in-field soil moisture sensors or professional irrigation scheduling.
 */

export type IrrigationCategory = 'adequate' | 'monitor' | 'irrigate_soon' | 'irrigate_now';

export interface IrrigationGridPoint {
  lat: number;
  lng: number;
  /** 0-100. Higher = more irrigation need. */
  index: number;
  category: IrrigationCategory;
  /** Root-zone volumetric water content (m³/m³), or null if unavailable */
  soil_moisture: number | null;
  /** 7-day precipitation minus 7-day reference ET₀, in mm. Negative = deficit. */
  water_balance_mm: number | null;
}

export interface IrrigationGrid {
  center: { lat: number; lng: number };
  radius_miles: number;
  /** Points form an NxN grid; this is N (needed by clients to size heatmap cells) */
  grid_size: number;
  points: IrrigationGridPoint[];
  generated_at: string;
}

export const IRRIGATION_CATEGORY_INFO: Record<
  IrrigationCategory,
  { label: string; color: string; description: string }
> = {
  adequate: {
    label: 'Adequate Moisture',
    color: '#16a34a',
    description: 'Soil moisture and recent rainfall look sufficient for now.',
  },
  monitor: {
    label: 'Monitor',
    color: '#eab308',
    description: 'Moisture is trending down — keep an eye on this area.',
  },
  irrigate_soon: {
    label: 'Irrigate Soon',
    color: '#f97316',
    description: 'A meaningful water deficit is building up.',
  },
  irrigate_now: {
    label: 'Irrigate Now',
    color: '#dc2626',
    description: 'Low soil moisture and/or a large water deficit — priority area.',
  },
};

const DEFAULT_GRID_SIZE = 5; // 5x5 = 25 points — keeps the request small and fast
const DEFAULT_RADIUS_MILES = 3; // ~6mi x 6mi coverage area, larger than most single fields
const MAX_RADIUS_MILES = 15;
const MAX_GRID_SIZE = 9;
const MILES_PER_DEGREE_LAT = 69.0;

/**
 * Builds an NxN grid of lat/lng sample points centered on (centerLat, centerLng),
 * spanning `radiusMiles` in each direction from the center.
 */
export function buildIrrigationGridPoints(
  centerLat: number,
  centerLng: number,
  radiusMiles: number = DEFAULT_RADIUS_MILES,
  gridSize: number = DEFAULT_GRID_SIZE
): { lat: number; lng: number }[] {
  const clampedRadius = Math.min(Math.max(radiusMiles, 0.5), MAX_RADIUS_MILES);
  const clampedGridSize = Math.min(Math.max(gridSize, 1), MAX_GRID_SIZE);

  const milesPerDegreeLng = MILES_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180);
  const step = clampedGridSize > 1 ? (clampedRadius * 2) / (clampedGridSize - 1) : 0;
  const mid = (clampedGridSize - 1) / 2;

  const points: { lat: number; lng: number }[] = [];
  for (let i = 0; i < clampedGridSize; i++) {
    for (let j = 0; j < clampedGridSize; j++) {
      const offsetMilesLat = (i - mid) * step;
      const offsetMilesLng = (j - mid) * step;
      points.push({
        lat: centerLat + offsetMilesLat / MILES_PER_DEGREE_LAT,
        lng: centerLng + offsetMilesLng / (milesPerDegreeLng || MILES_PER_DEGREE_LAT),
      });
    }
  }
  return points;
}

/**
 * Computes a 0-100 irrigation-need index from root-zone soil moisture and the
 * 7-day water balance (precipitation - ET₀). Higher = drier = more need.
 *
 * This is a simple, documented heuristic (not a scientific model):
 *   - 60% weight: soil moisture, scored against a typical 0.10 (dry) – 0.35
 *     (moist) volumetric water content range
 *   - 40% weight: water balance, scored against a 0mm (balanced) – -25mm
 *     (25mm weekly deficit) range
 * If only one signal is available, the index falls back to that signal
 * alone. If neither is available, an index of 50 ("Monitor") is returned.
 */
export function computeIrrigationIndex(
  soilMoisture: number | null,
  waterBalanceMm: number | null
): { index: number; category: IrrigationCategory } {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

  const moistureScore =
    soilMoisture != null && Number.isFinite(soilMoisture)
      ? clamp01((0.35 - soilMoisture) / (0.35 - 0.1))
      : null;
  const balanceScore =
    waterBalanceMm != null && Number.isFinite(waterBalanceMm)
      ? clamp01((0 - waterBalanceMm) / 25)
      : null;

  let score: number;
  if (moistureScore != null && balanceScore != null) {
    score = moistureScore * 0.6 + balanceScore * 0.4;
  } else if (moistureScore != null) {
    score = moistureScore;
  } else if (balanceScore != null) {
    score = balanceScore;
  } else {
    score = 0.5;
  }

  const index = Math.round(score * 100);
  const category: IrrigationCategory =
    index >= 75 ? 'irrigate_now' : index >= 50 ? 'irrigate_soon' : index >= 25 ? 'monitor' : 'adequate';

  return { index, category };
}

interface OpenMeteoLocationResult {
  current?: {
    soil_moisture_1_to_3cm?: number;
    soil_moisture_3_to_9cm?: number;
  };
  daily?: {
    precipitation_sum?: number[];
    et0_fao_evapotranspiration?: number[];
  };
}

/**
 * Fetches soil moisture + 7-day water balance for a grid of points around a
 * farmer's location in a SINGLE batched Open-Meteo request — Open-Meteo
 * supports comma-separated lat/lng lists and returns an array of per-location
 * results, so this stays cheap even for a 5x5 (25-point) grid.
 */
export async function fetchIrrigationGrid(
  centerLat: number,
  centerLng: number,
  radiusMiles: number = DEFAULT_RADIUS_MILES,
  gridSize: number = DEFAULT_GRID_SIZE
): Promise<IrrigationGrid> {
  const points = buildIrrigationGridPoints(centerLat, centerLng, radiusMiles, gridSize);

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', points.map((p) => p.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude', points.map((p) => p.lng.toFixed(4)).join(','));
  url.searchParams.set('current', 'soil_moisture_1_to_3cm,soil_moisture_3_to_9cm');
  url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration');
  url.searchParams.set('past_days', '7');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 1800 }, // cache 30 minutes — this data doesn't change quickly
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Open-Meteo API error: ${res.status} ${res.statusText}${errorBody ? ` — ${errorBody}` : ''}`
    );
  }

  const data: unknown = await res.json();
  // With multiple locations, Open-Meteo returns an array of per-location result objects.
  const results: OpenMeteoLocationResult[] = Array.isArray(data) ? data : [data as OpenMeteoLocationResult];

  const gridPoints: IrrigationGridPoint[] = points.map((point, i) => {
    const r = results[i];

    const m1 = r?.current?.soil_moisture_1_to_3cm;
    const m2 = r?.current?.soil_moisture_3_to_9cm;
    const soilMoisture =
      m1 != null && m2 != null ? (m1 + m2) / 2 : m1 ?? m2 ?? null;

    // Daily arrays cover the past 7 complete days followed by today (partial),
    // since we requested past_days=7 & forecast_days=1. Only sum the 7
    // complete days for a stable trailing 7-day water balance.
    const precipArr = r?.daily?.precipitation_sum ?? [];
    const et0Arr = r?.daily?.et0_fao_evapotranspiration ?? [];
    const waterBalanceMm =
      precipArr.length >= 7 && et0Arr.length >= 7
        ? precipArr.slice(0, 7).reduce((sum, v) => sum + (v ?? 0), 0) -
          et0Arr.slice(0, 7).reduce((sum, v) => sum + (v ?? 0), 0)
        : null;

    const { index, category } = computeIrrigationIndex(soilMoisture ?? null, waterBalanceMm);

    return {
      lat: point.lat,
      lng: point.lng,
      index,
      category,
      soil_moisture: soilMoisture ?? null,
      water_balance_mm: waterBalanceMm != null ? Math.round(waterBalanceMm * 10) / 10 : null,
    };
  });

  return {
    center: { lat: centerLat, lng: centerLng },
    radius_miles: radiusMiles,
    grid_size: gridSize,
    points: gridPoints,
    generated_at: new Date().toISOString(),
  };
}
