import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/farm/crop-detect?lat={lat}&lon={lon}
 *
 * Proxies to the USDA NASS Cropland Data Layer (CDL) to identify what crop
 * is planted at a given coordinate. CDL covers the contiguous US and is
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

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
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

  // CDL data is typically 1–2 years behind. Try current year, then fall back.
  const currentYear = new Date().getFullYear();
  const yearsToTry = [currentYear - 1, currentYear - 2, currentYear];

  for (const year of yearsToTry) {
    try {
      const url = `${CDL_BASE}.json?year=${year}&x=${lon}&y=${lat}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as { result?: { value?: string; category?: string } };
      const category = data?.result?.category?.trim();

      if (category && !SKIP_CATEGORIES.has(category)) {
        return NextResponse.json(
          { crop: category, year, value: data.result?.value },
          {
            headers: {
              // Cache at the CDN layer — CDL data is static for a given year
              'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
            },
          }
        );
      }
    } catch {
      // Non-fatal — try next year
      continue;
    }
  }

  // No crop found (ocean, foreign coordinates, true background pixel)
  return NextResponse.json({ crop: null, year: null });
}
