/**
 * GET /api/public/openet-et
 *
 * Public (no customer auth) endpoint that proxies a lat/lng point request
 * to the OpenET API. The OPENET_API_KEY is kept server-side and never
 * exposed to the browser.
 *
 * Query params:
 *   ?lat=38.87626&lng=-121.36322   — required coordinates
 *   ?months=12                      — trailing months to fetch (default: 12, max: 24)
 *   ?units=in                       — 'in' or 'mm' (default: 'in')
 *
 * Returns: { points: [{ time, et }], units, model, fetchedAt }
 *
 * Returns 503 (not 500) when the OpenET API key is not configured so the
 * client can show a graceful "unavailable" state rather than an error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, createRateLimitResponse, rateLimiters, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { fetchOpenETTimeseries } from '@/lib/openet';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  months: z.coerce.number().int().min(1).max(24).default(12),
  units: z.enum(['in', 'mm']).default('in'),
});

// In-memory request-level cache: key → { data, expiresAt }
// OpenET data is updated ~monthly so a 6-hour server-side cache is plenty.
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit — OpenET has a quota so be conservative here
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/public/openet-et', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // If OpenET key not configured, return a clean 503 instead of crashing
  if (!process.env.OPENET_API_KEY) {
    return NextResponse.json(
      { error: 'OpenET data is not available for this installation.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    months: searchParams.get('months') ?? undefined,
    units: searchParams.get('units') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide lat and lng query parameters (e.g. ?lat=38.5&lng=-121.3)' },
      { status: 400 }
    );
  }

  const { lat, lng, months, units } = parsed.data;

  // Cache key rounded to ~1km precision to improve cache hit rate for nearby points
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${months},${units}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'private, max-age=21600, stale-while-revalidate=3600',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const timeseries = await fetchOpenETTimeseries(lat, lng, months, 'monthly', units);

    cache.set(cacheKey, { data: timeseries, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(timeseries, {
      headers: {
        'Cache-Control': 'private, max-age=21600, stale-while-revalidate=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    securityLogger.logError('OpenET API fetch failed', error, ip);
    const msg = error instanceof Error ? error.message : 'Failed to fetch ET data';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
