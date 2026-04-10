import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import {
  fetchSoilTemperature,
  assessPlantingReadiness,
} from '@/lib/soil-temperature';
import { fetchWeatherContext } from '@/lib/weather-context';
import { geocodeZip } from '@/lib/geocode';

const querySchema = z.union([
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    zip: z.undefined(),
    crop: z.enum(['corn', 'soybeans', 'wheat', 'cotton', 'peanuts']).optional(),
  }),
  z.object({
    zip: z.string().regex(/^\d{5}$/),
    lat: z.undefined(),
    lng: z.undefined(),
    crop: z.enum(['corn', 'soybeans', 'wheat', 'cotton', 'peanuts']).optional(),
  }),
]);

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawParams = {
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    zip: searchParams.get('zip') ?? undefined,
    crop: searchParams.get('crop') ?? undefined,
  };

  const parsed = querySchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide either lat+lng or a 5-digit zip code', details: parsed.error.issues },
      { status: 400 }
    );
  }

  let lat: number;
  let lng: number;
  const crop = parsed.data.crop;

  if (parsed.data.zip) {
    const coords = await geocodeZip(parsed.data.zip);
    if (!coords) {
      return NextResponse.json(
        { error: 'Unable to determine coordinates for the provided ZIP code.' },
        { status: 400 }
      );
    }
    lat = coords.lat;
    lng = coords.lng;
  } else {
    lat = parsed.data.lat!;
    lng = parsed.data.lng!;
  }

  try {
    const [soilTemp, weather] = await Promise.all([
      fetchSoilTemperature(lat, lng),
      fetchWeatherContext(lat, lng),
    ]);

    const readiness = crop
      ? assessPlantingReadiness(soilTemp.current_f, crop, soilTemp.forecast_daily_f)
      : null;

    return NextResponse.json({
      soil_temperature: soilTemp,
      weather,
      planting_readiness: readiness,
      /** Resolved coordinates (useful when zip was provided) */
      resolved_coords: { lat, lng },
    });
  } catch (error) {
    console.error('[soil-temperature] fetch error', error, { ip });
    return NextResponse.json(
      { error: 'Failed to fetch environmental data. Please try again.' },
      { status: 502 }
    );
  }
}
