/**
 * lib/openet.ts
 *
 * Server-side wrapper for the OpenET REST API (https://openet-api.org).
 * Fetches satellite-based actual evapotranspiration (ET) data for a
 * given lat/lng point using the Ensemble model.
 *
 * API key is read from OPENET_API_KEY env var — never exposed to the client.
 *
 * Docs: https://etdata.org/api/api-documentation/
 */

const OPENET_BASE_URL = 'https://openet-api.org';

export interface OpenETDataPoint {
  /** "YYYY-MM" for monthly, "YYYY-MM-DD" for daily */
  time: string;
  /** ET value in the requested units */
  et: number;
}

export interface OpenETTimeseries {
  points: OpenETDataPoint[];
  units: 'mm' | 'in';
  model: string;
  variable: string;
  /** ISO string of when this was fetched */
  fetchedAt: string;
}

export type OpenETInterval = 'monthly' | 'daily';
export type OpenETUnits = 'mm' | 'in';
export type OpenETModel =
  | 'Ensemble'
  | 'SSEBop'
  | 'SIMS'
  | 'eeMETRIC'
  | 'PT-JPL'
  | 'DISALEXI-EEFLUX';

interface OpenETRequestBody {
  date_range: [string, string];
  interval: OpenETInterval;
  /** [longitude, latitude] — note GeoJSON order */
  geometry: [number, number];
  model: OpenETModel;
  variable: 'ET' | 'ETo' | 'ETr' | 'NDVI' | 'count' | 'std';
  reference_et: 'gridMET' | 'CIMIS' | 'NLDAS' | 'FEWS';
  units: OpenETUnits;
  file_format: 'JSON' | 'CSV';
}

/**
 * Normalizes the OpenET JSON response which can be:
 *   - An array of { time, et } objects
 *   - An object with a `timeseries` array
 *   - An object with keys that are dates mapped to values
 */
function normalizeResponse(raw: unknown): OpenETDataPoint[] {
  if (Array.isArray(raw)) {
    return (raw as Record<string, unknown>[])
      .filter((r) => r.time != null && r.et != null)
      .map((r) => ({ time: String(r.time), et: Number(r.et) }))
      .filter((r) => !isNaN(r.et));
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    // { timeseries: [...] }
    if (Array.isArray(obj.timeseries)) {
      return normalizeResponse(obj.timeseries);
    }

    // { "2020-01": 1.23, "2020-02": 2.34, ... }
    const dateKeys = Object.keys(obj).filter((k) => /^\d{4}-\d{2}/.test(k));
    if (dateKeys.length > 0) {
      return dateKeys
        .map((k) => ({ time: k, et: Number(obj[k]) }))
        .filter((r) => !isNaN(r.et))
        .sort((a, b) => a.time.localeCompare(b.time));
    }
  }

  return [];
}

/**
 * Fetches ET timeseries data for a single lat/lng point.
 *
 * @param lat - Latitude (WGS84)
 * @param lng - Longitude (WGS84)
 * @param months - Number of trailing months to fetch (default: 12)
 * @param interval - 'monthly' or 'daily' (default: 'monthly')
 * @param units - 'in' (inches) or 'mm' (default: 'in')
 */
export async function fetchOpenETTimeseries(
  lat: number,
  lng: number,
  months: number = 12,
  interval: OpenETInterval = 'monthly',
  units: OpenETUnits = 'in'
): Promise<OpenETTimeseries> {
  const apiKey = process.env.OPENET_API_KEY;
  if (!apiKey) {
    throw new Error('OPENET_API_KEY is not configured');
  }

  // OpenET requires complete months so we start from the first of
  // (today minus `months` months) and end on the last complete month.
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (months - 1), 1);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const body: OpenETRequestBody = {
    date_range: [fmt(startDate), fmt(endDate)],
    interval,
    geometry: [lng, lat], // GeoJSON order: [lng, lat]
    model: 'Ensemble',
    variable: 'ET',
    reference_et: 'gridMET',
    units,
    file_format: 'JSON',
  };

  const res = await fetch(`${OPENET_BASE_URL}/raster/timeseries/point`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenET API error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }

  const raw: unknown = await res.json();
  const points = normalizeResponse(raw);

  return {
    points,
    units,
    model: 'Ensemble',
    variable: 'ET',
    fetchedAt: new Date().toISOString(),
  };
}
