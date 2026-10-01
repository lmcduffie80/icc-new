import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { nominatimReverseGeocode } from '@/lib/ftw';

// GET /api/farm/geocode?lat=31.44&lon=-83.40
// Server-side Nominatim reverse geocode proxy. Returns country + US state code.
export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'Invalid lat/lon' }, { status: 400 });
  }

  const result = await nominatimReverseGeocode(lat, lon);
  if (!result) return NextResponse.json({}, { status: 200 }); // Soft fail

  return NextResponse.json(
    { countryCode: result.countryCode, stateCode: result.stateCode ?? null },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    }
  );
}
