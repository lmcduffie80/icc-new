/**
 * GET /api/public/soil-conditions
 *
 * Public (no auth) endpoint that returns soil temperature, soil moisture,
 * and location context for a given lat/lng or ZIP code.
 *
 * Used by the Soil Intelligence page — free for all farmers.
 *
 * Query params:
 *   ?lat=41.5&lng=-93.5   — coordinates
 *   ?zip=50501             — US ZIP code
 *
 * Returns:
 *   { location, soil_temperature, soil_moisture, weather }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';
import { fetchSoilTemperature, assessPlantingReadiness } from '@/lib/soil-temperature';
import { fetchWeatherContext } from '@/lib/weather-context';
import { geocodeZip } from '@/lib/geocode';
import {
  fetchSoilMoisture,
  latLngToStateFips,
  FIPS_STATE,
  STATE_FIPS,
} from '@/lib/smap';

// State name lookup (FIPS_STATE gives abbreviation; we want the display name too)
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'Washington D.C.', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const querySchema = z.union([
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    zip: z.undefined(),
  }),
  z.object({
    zip: z.string().regex(/^\d{5}$/),
    lat: z.undefined(),
    lng: z.undefined(),
  }),
]);

/** Reverse geocode via Nominatim to get city/county/state name */
async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string;
  county: string;
  state: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'InnovativeCropCare/1.0 (contact@innovativecropcare.com)' },
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string }
    };
    const a = data.address ?? {};
    return {
      city: a.city ?? a.town ?? a.village ?? '',
      county: a.county ?? '',
      state: a.state ?? '',
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const { searchParams } = new URL(request.url);
  const rawParams = {
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    zip: searchParams.get('zip') ?? undefined,
  };

  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide either lat+lng or a 5-digit zip code' },
      { status: 400 }
    );
  }

  let lat: number;
  let lng: number;

  if (parsed.data.zip) {
    const coords = await geocodeZip(parsed.data.zip);
    if (!coords) {
      return NextResponse.json(
        { error: 'Unable to determine coordinates for that ZIP code.' },
        { status: 400 }
      );
    }
    lat = coords.lat;
    lng = coords.lng;
  } else {
    lat = parsed.data.lat!;
    lng = parsed.data.lng!;
  }

  // Derive state from coordinates
  const stateFips = latLngToStateFips(lat, lng);
  const stateAbbr = stateFips ? (FIPS_STATE[stateFips] ?? '') : '';
  const stateName = STATE_NAMES[stateAbbr] ?? stateAbbr;

  try {
    // Fetch all data in parallel
    const [soilTemp, weather, soilMoisture, geoInfo] = await Promise.all([
      fetchSoilTemperature(lat, lng).catch(() => null),
      fetchWeatherContext(lat, lng).catch(() => null),
      stateFips ? fetchSoilMoisture(stateFips).catch(() => null) : Promise.resolve(null),
      reverseGeocode(lat, lng).catch(() => null),
    ]);

    const plantingReadiness = soilTemp
      ? assessPlantingReadiness(soilTemp.current_f, 'corn', soilTemp.forecast_daily_f)
      : null;

    // Build a human-readable location label
    let locationLabel = stateName;
    if (geoInfo?.county && geoInfo.county !== stateName) {
      locationLabel = `${geoInfo.county}, ${stateAbbr}`;
    } else if (geoInfo?.city && geoInfo.city !== stateName) {
      locationLabel = `${geoInfo.city}, ${stateAbbr}`;
    }

    return NextResponse.json({
      location: {
        lat,
        lng,
        zip: parsed.data.zip ?? null,
        state_abbr: stateAbbr,
        state_name: stateName,
        state_fips: stateFips,
        city: geoInfo?.city ?? null,
        county: geoInfo?.county ?? null,
        label: locationLabel,
      },
      soil_temperature: soilTemp,
      soil_moisture: soilMoisture,
      weather,
      planting_readiness: plantingReadiness,
      fetched_at: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'private, max-age=1800, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch conditions';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
