import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { generateFieldImage, isSentinelHubConfigured, type VegetationLayer } from '@/lib/sentinel-hub';

const VALID_LAYERS: VegetationLayer[] = ['ndwi', 'ndvi', 'truecolor', 'evi', 'false-color'];

// GET /api/farm/fields/[fieldId]/satellite/image?date=2026-09-15&layer=ndwi
// Generates and returns a Sentinel-2 PNG image for the given date + layer.
// Cached by the browser for 24 hours via Cache-Control headers.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  const ip = getClientIp(request);
  // Use lenient rate limit — browser re-requests tiles on pan/zoom
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const { fieldId } = await params;
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const layerParam = (searchParams.get('layer') ?? 'ndwi') as VegetationLayer;

  if (!dateParam) return new NextResponse('Missing date parameter', { status: 400 });
  if (!VALID_LAYERS.includes(layerParam)) return new NextResponse('Invalid layer', { status: 400 });

  const targetDate = new Date(dateParam);
  if (isNaN(targetDate.getTime())) return new NextResponse('Invalid date format', { status: 400 });

  if (!isSentinelHubConfigured()) {
    return new NextResponse('Satellite imagery not configured', { status: 503 });
  }

  try {
    // Verify ownership + fetch geometry
    const field = await queryOne<{
      geojson: { type: string; coordinates: [number, number][][] };
    }>(
      `SELECT geojson FROM farm_field_polygons WHERE id = $1 AND user_id = $2`,
      [fieldId, session.user.id]
    );
    if (!field) return new NextResponse('Field not found', { status: 404 });

    const imageBuffer = await generateFieldImage(field.geojson, targetDate, layerParam);

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Cache for 24 hours in browser + CDN — satellite data for a given date never changes
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    securityLogger.logError('Failed to generate field image', error, ip);
    return new NextResponse('Failed to generate image', { status: 500 });
  }
}
