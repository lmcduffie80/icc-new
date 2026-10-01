/**
 * Sentinel Hub API client — Copernicus Data Space Ecosystem
 *
 * Provides:
 *  - OAuth2 access token management (client credentials, in-memory cache)
 *  - Catalog API  — search available Sentinel-2 scenes by date / cloud cover
 *  - Statistical API — NDWI + NDVI time-series stats over a GeoJSON polygon
 *  - Process API — render NDWI / NDVI / TrueColor / EVI images as PNG
 *
 * Required env vars:
 *   COPERNICUS_CLIENT_ID
 *   COPERNICUS_CLIENT_SECRET
 *   COPERNICUS_INSTANCE_ID   (Sentinel Hub Configuration Utility instance UUID)
 */

const CDSE_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const SH_BASE = 'https://sh.dataspace.copernicus.eu/api/v1';

// ─── Token cache ──────────────────────────────────────────────────────────────

let _tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }

  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET must be set');
  }

  const res = await fetch(CDSE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub auth failed ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return _tokenCache.token;
}

export function isSentinelHubConfigured(): boolean {
  return !!(
    process.env.COPERNICUS_CLIENT_ID &&
    process.env.COPERNICUS_CLIENT_SECRET &&
    process.env.COPERNICUS_INSTANCE_ID
  );
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Ensure every ring of a Polygon/MultiPolygon is closed (first coord = last coord).
 * Sentinel Hub rejects open rings with a 400 COMMON_BAD_PAYLOAD error.
 */
function ensureClosedGeometry(geometry: { type: string; coordinates: unknown }): { type: string; coordinates: unknown } {
  function closeRing(ring: number[][]): number[][] {
    if (ring.length === 0) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  }

  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: (geometry.coordinates as number[][][]).map(closeRing) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: (geometry.coordinates as number[][][][]).map((poly) => poly.map(closeRing)),
    };
  }
  return geometry;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VegetationLayer = 'ndwi' | 'ndvi' | 'truecolor' | 'evi' | 'false-color';

export interface SatelliteScene {
  /** Sentinel-2 scene identifier */
  id: string;
  /** ISO 8601 datetime string */
  date: string;
  /** Cloud cover percentage 0–100 */
  cloudCover: number;
}

export interface VegetationStats {
  /** ISO 8601 interval start date */
  date: string;
  ndwi: { mean: number; min: number; max: number } | null;
  ndvi: { mean: number; min: number; max: number } | null;
}

// ─── Catalog API ──────────────────────────────────────────────────────────────

/**
 * Search for available Sentinel-2 L2A scenes over a polygon.
 * Returns scenes sorted newest-first, filtered by maxCloudCover.
 */
export async function searchScenes(
  geometry: { type: string; coordinates: unknown },
  from: Date,
  to: Date,
  maxCloudCover = 80
): Promise<SatelliteScene[]> {
  const token = await getAccessToken();
  const closedGeometry = ensureClosedGeometry(geometry);

  const res = await fetch(`${SH_BASE}/catalog/1.0.0/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      datetime: `${from.toISOString()}/${to.toISOString()}`,
      intersects: closedGeometry,
      limit: 50,
      fields: {
        include: ['id', 'properties.datetime', 'properties.eo:cloud_cover'],
        exclude: ['links', 'assets'],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Catalog API ${res.status}: ${text.slice(0, 300)}`);
  }

  interface CatalogFeature {
    id: string;
    properties: { datetime: string; 'eo:cloud_cover': number };
  }

  const data = (await res.json()) as { features: CatalogFeature[] };

  return data.features
    .filter((f) => f.properties['eo:cloud_cover'] <= maxCloudCover)
    .map((f) => ({
      id: f.id,
      date: f.properties.datetime,
      cloudCover: Math.round(f.properties['eo:cloud_cover']),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Statistical API ──────────────────────────────────────────────────────────

/** Evalscript: compute NDWI + NDVI per pixel. Cloud-masked at the scene level via maxCloudCoverage. */
const STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B04","B08","dataMask"], units: "REFLECTANCE" }],
    output: [
      { id: "ndwi",    bands: 1, sampleType: "FLOAT32" },
      { id: "ndvi",    bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask",bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const mask = s.dataMask;
  const ndwi = (s.B03 + s.B08) > 0 ? (s.B03 - s.B08) / (s.B03 + s.B08) : 0;
  const ndvi = (s.B08 + s.B04) > 0 ? (s.B08 - s.B04) / (s.B08 + s.B04) : 0;
  return { ndwi:[ndwi], ndvi:[ndvi], dataMask:[mask] };
}`;

/**
 * Get NDWI + NDVI time-series statistics for a polygon.
 * Aggregated per 10-day interval over the requested date range.
 */
export async function getVegetationStats(
  geometry: { type: string; coordinates: unknown },
  from: Date,
  to: Date
): Promise<VegetationStats[]> {
  const token = await getAccessToken();
  const closedGeometry = ensureClosedGeometry(geometry);

  const res = await fetch(`${SH_BASE}/statistics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        bounds: {
          geometry: closedGeometry,
          properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: { mosaickingOrder: 'leastCC', maxCloudCoverage: 80 },
        }],
      },
      aggregation: {
        timeRange: { from: from.toISOString(), to: to.toISOString() },
        aggregationInterval: { of: 'P10D' },
        // Resolution in CRS84 degrees: ~20 m at mid-latitudes (0.0002° ≈ 22 m at equator)
        resx: 0.0002,
        resy: 0.0002,
        evalscript: STATS_EVALSCRIPT,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Statistical API ${res.status}: ${text.slice(0, 300)}`);
  }

  interface BandStats { mean: number; min: number; max: number; sampleCount: number; noDataCount: number }
  interface StatsInterval {
    interval: { from: string };
    outputs: {
      ndwi?: { bands: { B0: { stats: BandStats } } };
      ndvi?: { bands: { B0: { stats: BandStats } } };
    };
  }

  const data = (await res.json()) as { data: StatsInterval[] };

  return data.data
    .map((d) => {
      const ndwiS = d.outputs.ndwi?.bands.B0.stats;
      const ndviS = d.outputs.ndvi?.bands.B0.stats;
      const hasNdwi = ndwiS && ndwiS.sampleCount > ndwiS.noDataCount;
      const hasNdvi = ndviS && ndviS.sampleCount > ndviS.noDataCount;
      return {
        date: d.interval.from,
        ndwi: hasNdwi && ndwiS ? { mean: ndwiS.mean, min: ndwiS.min, max: ndwiS.max } : null,
        ndvi: hasNdvi && ndviS ? { mean: ndviS.mean, min: ndviS.min, max: ndviS.max } : null,
      };
    })
    .filter((d) => d.ndwi !== null || d.ndvi !== null);
}

// ─── Process API ──────────────────────────────────────────────────────────────

/** Evalscripts for image rendering — returns RGBA PNG. */
const EVALSCRIPTS: Record<VegetationLayer, string> = {
  ndwi: `//VERSION=3
// NDWI: blue=wet, green=moderate, brown=dry
function setup(){return{input:[{bands:["B03","B08","dataMask"],units:"REFLECTANCE"}],output:{bands:4}}}
function evaluatePixel(s){
  const v=(s.B03-s.B08)/(s.B03+s.B08+1e-10);
  let r,g,b;
  if(v>0.3){r=0.0;g=0.2;b=0.9}
  else if(v>0.1){r=0.2;g=0.55;b=1.0}
  else if(v>-0.1){r=0.55;g=0.82;b=0.55}
  else if(v>-0.3){r=0.92;g=0.82;b=0.4}
  else{r=0.72;g=0.45;b=0.2}
  return[r,g,b,s.dataMask];
}`,

  ndvi: `//VERSION=3
// NDVI: dark green=healthy, yellow=moderate, brown=bare
function setup(){return{input:[{bands:["B04","B08","dataMask"],units:"REFLECTANCE"}],output:{bands:4}}}
function evaluatePixel(s){
  const v=(s.B08-s.B04)/(s.B08+s.B04+1e-10);
  let r,g,b;
  if(v>0.5){r=0.0;g=0.45;b=0.0}
  else if(v>0.3){r=0.18;g=0.68;b=0.18}
  else if(v>0.1){r=0.6;g=0.85;b=0.4}
  else if(v>-0.1){r=0.92;g=0.9;b=0.55}
  else{r=0.7;g=0.48;b=0.28}
  return[r,g,b,s.dataMask];
}`,

  truecolor: `//VERSION=3
function setup(){return{input:[{bands:["B04","B03","B02","dataMask"],units:"REFLECTANCE"}],output:{bands:4}}}
function evaluatePixel(s){return[3.5*s.B04,3.5*s.B03,3.5*s.B02,s.dataMask]}`,

  evi: `//VERSION=3
// EVI: enhanced vegetation index
function setup(){return{input:[{bands:["B02","B04","B08","dataMask"],units:"REFLECTANCE"}],output:{bands:4}}}
function evaluatePixel(s){
  const v=2.5*(s.B08-s.B04)/(s.B08+6*s.B04-7.5*s.B02+1+1e-10);
  let r,g,b;
  if(v>0.4){r=0.0;g=0.38;b=0.0}
  else if(v>0.2){r=0.28;g=0.68;b=0.2}
  else if(v>0.0){r=0.68;g=0.85;b=0.48}
  else{r=0.8;g=0.62;b=0.4}
  return[r,g,b,s.dataMask];
}`,

  'false-color': `//VERSION=3
// False color: NIR=red, Red=green, Green=blue → healthy veg appears bright red
function setup(){return{input:[{bands:["B08","B04","B03","dataMask"],units:"REFLECTANCE"}],output:{bands:4}}}
function evaluatePixel(s){return[3.5*s.B08,3.5*s.B04,3.5*s.B03,s.dataMask]}`,
};

/**
 * Generate a PNG image of a field using the Sentinel Hub Process API.
 *
 * @param geometry   Field polygon GeoJSON geometry
 * @param date       Target date — uses a ±4-day window to find the best (least-cloudy) scene
 * @param layer      Vegetation layer to render
 * @param size       Output image width/height in pixels (default 512)
 * @returns          Raw PNG as a Buffer
 */
export async function generateFieldImage(
  geometry: { type: string; coordinates: unknown },
  date: Date,
  layer: VegetationLayer = 'ndwi',
  size = 512
): Promise<Buffer> {
  const token = await getAccessToken();
  const closedGeometry = ensureClosedGeometry(geometry);

  const from = new Date(date.getTime() - 4 * 24 * 60 * 60 * 1000);
  const to = new Date(date.getTime() + 4 * 24 * 60 * 60 * 1000);

  const res = await fetch(`${SH_BASE}/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify({
      input: {
        bounds: {
          geometry: closedGeometry,
          properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: from.toISOString(), to: to.toISOString() },
            maxCloudCoverage: 50,
            mosaickingOrder: 'leastCC',
          },
        }],
      },
      output: {
        width: size,
        height: size,
        responses: [{ identifier: 'default', format: { type: 'image/png' } }],
      },
      evalscript: EVALSCRIPTS[layer],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Process API ${res.status}: ${text.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Compute bounding box [[minLat, minLon], [maxLat, maxLon]] from a
 * GeoJSON polygon coordinate ring [[lon, lat], ...].
 * Used to position a Leaflet ImageOverlay over the exact field extent.
 */
export function polygonBounds(
  coords: [number, number][]
): [[number, number], [number, number]] {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [[minLat, minLon], [maxLat, maxLon]];
}
