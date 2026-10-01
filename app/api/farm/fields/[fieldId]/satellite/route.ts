import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { searchScenes, getVegetationStats, isSentinelHubConfigured } from '@/lib/sentinel-hub';
import { redis } from '@/lib/rate-limit';

const CACHE_TTL = 60 * 60 * 6; // 6 hours — Sentinel-2 revisits every ~5 days

// GET /api/farm/fields/[fieldId]/satellite
// Returns available Sentinel-2 scenes + NDWI/NDVI statistics for the past 90 days.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fieldId } = await params;

  if (!isSentinelHubConfigured()) {
    return NextResponse.json(
      { error: 'Satellite imagery is not configured. Set COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET, and COPERNICUS_INSTANCE_ID.' },
      { status: 503 }
    );
  }

  try {
    // Verify field ownership and fetch geometry
    const field = await queryOne<{
      polygon_name: string;
      geojson: { type: string; coordinates: [number, number][][] };
    }>(
      `SELECT polygon_name, geojson FROM farm_field_polygons WHERE id = $1 AND user_id = $2`,
      [fieldId, session.user.id]
    );
    if (!field) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

    const cacheKey = `sh:satellite:${fieldId}`;

    // Redis cache check
    if (redis) {
      try {
        const cached = await redis.get<object>(cacheKey);
        if (cached) return NextResponse.json({ ...cached, cached: true });
      } catch {
        // Non-fatal cache miss
      }
    }

    // Query Sentinel Hub: last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const geometry = field.geojson;

    const [scenes, stats] = await Promise.all([
      searchScenes(geometry, ninetyDaysAgo, now, 80),
      getVegetationStats(geometry, ninetyDaysAgo, now),
    ]);

    const result = {
      scenes,
      stats,
      fieldName: field.polygon_name,
      fieldGeometry: geometry,
    };

    // Cache result
    if (redis) {
      try {
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    securityLogger.logError('Failed to fetch satellite data', error, ip);
    return NextResponse.json(
      { error: 'Failed to fetch satellite data. Please try again.' },
      { status: 500 }
    );
  }
}
