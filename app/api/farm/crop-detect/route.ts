import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/farm/crop-detect?lat={lat}&lon={lon}
 *
 * Proxies to the USDA NASS Cropland Data Layer (CDL) to identify what crop
 * is planted at a given WGS84 coordinate. CDL covers the contiguous US and is
 * updated annually (typically 1–2 years lag).
 *
 * https://nassgeodata.gmu.edu/CropScape/
 */
const CDL_BASE = 'https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue';

// CDL categories that aren't meaningful crops — skip these
const SKIP_CATEGORIES = new Set([
  'Background', 'Open Water', 'Perennial Ice/Snow',
  'Developed/Open Space', 'Developed/Low Intensity', 'Developed/Med Intensity',
  'Developed/High Intensity', 'Barren', 'Deciduous Forest', 'Evergreen Forest',
  'Mixed Forest', 'Shrubland', 'Grassland/Pasture', 'Woody Wetlands',
  'Herbaceous Wetlands',
]);

// ---------------------------------------------------------------------------
// Coordinate projection: WGS84 (lon, lat) → EPSG:5070 NAD83/Conus Albers (m)
//
// The CDL API uses the Albers Equal Area Conic projection (EPSG:5070) as its
// native CRS. All GetCDLValue x/y inputs must be in that projection.
// Formulas from Snyder (1987) "Map Projections — A Working Manual", §14.
// ---------------------------------------------------------------------------
function wgs84ToAlbers5070(lon: number, lat: number): [number, number] {
  const a  = 6378137.0;             // GRS80 semi-major axis (m)
  const e2 = 0.006694379990141317;  // GRS80 first eccentricity squared
  const e  = Math.sqrt(e2);

  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi0 = toRad(23);    // latitude of origin
  const lam0 = toRad(-96);   // central meridian
  const phi1 = toRad(29.5);  // standard parallel 1
  const phi2 = toRad(45.5);  // standard parallel 2
  const phi  = toRad(lat);
  const lam  = toRad(lon);

  // Snyder eq. 3-12
  const q = (p: number) => {
    const sp  = Math.sin(p);
    const esp = e * sp;
    return (
      (1 - e2) *
      (sp / (1 - e2 * sp * sp) - (1 / (2 * e)) * Math.log((1 - esp) / (1 + esp)))
    );
  };

  // Snyder eq. 14-15
  const mFn = (p: number) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);

  const m1 = mFn(phi1);
  const m2 = mFn(phi2);
  const q0 = q(phi0);
  const q1 = q(phi1);
  const q2 = q(phi2);
  const qp = q(phi);

  const n    = (m1 * m1 - m2 * m2) / (q2 - q1);
  const C    = m1 * m1 + n * q1;
  const rho0 = (a / n) * Math.sqrt(C - n * q0);
  const rho  = (a / n) * Math.sqrt(C - n * qp);
  const theta = n * (lam - lam0);

  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

// ---------------------------------------------------------------------------
// Parse CDL value from the SOAP XML response.
// Response looks like:
//   <Result>{x: 894000.0, y: 1080000.0, value: 176, category: "Corn", ...}</Result>
// ---------------------------------------------------------------------------
function parseCdlResponse(xml: string): { value: string; category: string } | null {
  const resultMatch = xml.match(/<Result>([\s\S]*?)<\/Result>/);
  if (!resultMatch) return null;
  const body = resultMatch[1];

  const catMatch  = body.match(/category:\s*"([^"]+)"/);
  const valMatch  = body.match(/value:\s*([^,}\s]+)/);

  if (!catMatch) return null;
  return { category: catMatch[1].trim(), value: valMatch?.[1]?.trim() ?? '' };
}

export async function GET(request: NextRequest) {
  getClientIp(request); // captured for potential future security logging

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  // Project WGS84 → EPSG:5070 (CDL native CRS)
  const [ax, ay] = wgs84ToAlbers5070(lon, lat);

  // CDL data is typically 1–2 years behind current year. Try most recent first.
  const currentYear = new Date().getFullYear();
  const yearsToTry = [currentYear - 1, currentYear - 2, currentYear];

  for (const year of yearsToTry) {
    try {
      const url = `${CDL_BASE}?year=${year}&x=${Math.round(ax)}&y=${Math.round(ay)}`;
      const res = await fetch(url, {
        headers: { Accept: 'text/xml, application/xml' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const xml  = await res.text();
      const parsed = parseCdlResponse(xml);

      if (!parsed) continue;
      if (SKIP_CATEGORIES.has(parsed.category)) continue;

      return NextResponse.json(
        { crop: parsed.category, year, value: parsed.value },
        {
          headers: {
            // CDL data is static for a given year — cache aggressively at CDN
            'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
          },
        }
      );
    } catch {
      // Non-fatal — try next year
      continue;
    }
  }

  // No crop found (non-US, ocean, true background pixel)
  return NextResponse.json({ crop: null, year: null });
}
