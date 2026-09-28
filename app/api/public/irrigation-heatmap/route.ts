/**
 * GET /api/public/irrigation-heatmap
 *
 * Public (no auth) endpoint that returns a small grid of irrigation-need
 * readings around a given lat/lng — powers the zoomable field-level heatmap
 * on the Soil Intelligence page.
 *
 * Query params:
 *   ?lat=41.5&lng=-93.5   — required coordinates (center point)
 *
 * Returns:
 *   { center, radius_miles, points: [{ lat, lng, index, category, ... }], generated_at }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, createRateLimitResponse, rateLimiters, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { fetchIrrigationGrid } from '@/lib/irrigation';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/public/irrigation-heatmap', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide lat and lng query parameters (e.g. ?lat=41.5&lng=-93.5)' },
      { status: 400 }
    );
  }

  try {
    const grid = await fetchIrrigationGrid(parsed.data.lat, parsed.data.lng);
    return NextResponse.json(grid, {
      headers: {
        'Cache-Control': 'private, max-age=1800, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch irrigation heatmap', error, ip);
    return NextResponse.json(
      { error: 'Unable to fetch irrigation data right now. Please try again shortly.' },
      { status: 502 }
    );
  }
}
