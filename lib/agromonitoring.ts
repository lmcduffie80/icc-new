/**
 * Agromonitoring API client
 *
 * Handles field polygon management and satellite imagery for the
 * Field Satellite Monitoring feature.
 *
 * Base URL: https://agromonitoring.com/api/agromonitoring
 * Tile URL: https://tile.agromonitoring.com/active/{imageId}/{layer}/{z}/{x}/{y}.png
 *
 * All requests require ?appid={AGROMONITORING_API_KEY}.
 *
 * Vegetation layers (for tile overlay):
 *   ndwi     — Normalized Difference Water Index (irrigation monitoring)
 *   ndvi     — Normalized Difference Vegetation Index (crop health)
 *   evi      — Enhanced Vegetation Index
 *   dswi     — Disease-Water Stress Index
 *   truecolor — Visible spectrum reference
 */

const AGRO_BASE = 'https://agromonitoring.com/api/agromonitoring';
const AGRO_TILE_BASE = 'https://tile.agromonitoring.com/active';

export function isAgromonitoringConfigured(): boolean {
  return !!process.env.AGROMONITORING_API_KEY;
}

function apiKey(): string {
  const key = process.env.AGROMONITORING_API_KEY;
  if (!key) throw new Error('AGROMONITORING_API_KEY is not set');
  return key;
}

function url(path: string): string {
  return `${AGRO_BASE}${path}?appid=${apiKey()}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url(path), {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agromonitoring API ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgroPolygon {
  id: string;
  name: string;
  geo_json: {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  };
  user_id: string;
  area: number;
  created_at: number;
}

export interface AgroSatelliteImage {
  dt: number;           // UNIX timestamp of the image
  type: string;         // 'Landsat-8' | 'Sentinel-2'
  dc: number;           // Cloud coverage percentage (0–100)
  valid_data_percentage: number;
  image: {
    truecolor: string;
    falsecolor: string;
    ndvi: string;
    ndwi: string;
    evi?: string;
    evi2?: string;
    nri?: string;
    dswi?: string;
  };
  stats: {
    ndvi: { mean: number };
  };
}

export interface AgroNdviHistory {
  dt: number;           // UNIX timestamp
  source: number;       // Satellite source code
  dc: number;           // Cloud coverage %
  zoom: number;
  data: {
    ndvi: {
      mean: number;
      min: number;
      max: number;
      median: number;
      std: number;
    };
  };
}

export interface AgroVegetationStats {
  dt: number;
  source: number;
  dc: number;
  zoom: number;
  data: {
    ndvi?: { mean: number; min: number; max: number };
    ndwi?: { mean: number; min: number; max: number };
    evi?: { mean: number; min: number; max: number };
    dswi?:{ mean: number; min: number; max: number };
  };
}

// ─── Polygon management ───────────────────────────────────────────────────────

/**
 * Create a new polygon in Agromonitoring.
 * @param name  Human-readable field name
 * @param coords  Array of [lon, lat] coordinate pairs (ring must be closed — first === last)
 */
export async function createAgroPolygon(
  name: string,
  coords: [number, number][]
): Promise<AgroPolygon> {
  // Ensure ring is closed
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  return request<AgroPolygon>('/polygons', {
    method: 'POST',
    body: JSON.stringify({
      name,
      geo_json: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    }),
  });
}

/** List all polygons for the configured API key. */
export async function listAgroPolygons(): Promise<AgroPolygon[]> {
  return request<AgroPolygon[]>('/polygons');
}

/** Get a single polygon by ID. */
export async function getAgroPolygon(polyId: string): Promise<AgroPolygon> {
  return request<AgroPolygon>(`/polygons/${polyId}`);
}

/** Delete a polygon from Agromonitoring. */
export async function deleteAgroPolygon(polyId: string): Promise<void> {
  await request<unknown>(`/polygons/${polyId}`, { method: 'DELETE' });
}

// ─── Satellite imagery ────────────────────────────────────────────────────────

/**
 * Search for available satellite images for a polygon in the given date range.
 * @param polyId  Agromonitoring polygon ID
 * @param from    Start date (Date object or UNIX seconds)
 * @param to      End date (Date object or UNIX seconds)
 */
export async function searchSatelliteImages(
  polyId: string,
  from: Date | number,
  to: Date | number
): Promise<AgroSatelliteImage[]> {
  const fromTs = typeof from === 'number' ? from : Math.floor(from.getTime() / 1000);
  const toTs = typeof to === 'number' ? to : Math.floor(to.getTime() / 1000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `${AGRO_BASE}/image/search?polyid=${polyId}&from=${fromTs}&to=${toTs}&appid=${apiKey()}`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agromonitoring image/search ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<AgroSatelliteImage[]>;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch NDVI/vegetation history for a polygon.
 * @param polyId  Agromonitoring polygon ID
 * @param from    Start date
 * @param to      End date
 */
export async function getVegetationHistory(
  polyId: string,
  from: Date | number,
  to: Date | number
): Promise<AgroNdviHistory[]> {
  const fromTs = typeof from === 'number' ? from : Math.floor(from.getTime() / 1000);
  const toTs = typeof to === 'number' ? to : Math.floor(to.getTime() / 1000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `${AGRO_BASE}/ndvi/history?polyid=${polyId}&from=${fromTs}&to=${toTs}&appid=${apiKey()}`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agromonitoring ndvi/history ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<AgroNdviHistory[]>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Tile URL builder ─────────────────────────────────────────────────────────

export type VegetationLayer = 'ndwi' | 'ndvi' | 'truecolor' | 'falsecolor' | 'evi' | 'dswi';

/**
 * Build a Leaflet-compatible tile URL for a satellite image layer.
 * Use as the `url` prop on a react-leaflet TileLayer.
 *
 * @param imageId  The `dt` (timestamp) value from AgroSatelliteImage — used as image ID
 * @param layer    Vegetation layer to display
 *
 * @example
 *   buildTileUrl(image.dt, 'ndwi')
 *   // → "https://tile.agromonitoring.com/active/1234567890/ndwi/{z}/{x}/{y}.png?appid=..."
 */
export function buildTileUrl(imageId: number, layer: VegetationLayer): string {
  return `${AGRO_TILE_BASE}/${imageId}/${layer}/{z}/{x}/{y}.png?appid=${apiKey()}`;
}
