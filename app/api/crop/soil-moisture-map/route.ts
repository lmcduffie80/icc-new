/**
 * GET /api/crop/soil-moisture-map
 *
 * Returns NASA SMAP soil moisture conditions for all continental US states,
 * used to color-code the USMap component.
 *
 * Results are cached in-memory for 4 hours (SMAP data is daily).
 * First call fetches all ~48 states in parallel (~2-3 s); subsequent calls
 * return immediately from cache.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';
import {
  fetchSoilMoistureForStates,
  CONTINENTAL_FIPS,
  FIPS_STATE,
  type SoilMoisture,
} from '@/lib/smap';

export type SoilMoistureMapData = {
  /** keyed by two-letter state abbreviation */
  states: Record<string, SoilMoisture>;
  fetchedAt: number;
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cache: { data: SoilMoistureMapData; expiresAt: number } | null = null;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, stale-while-revalidate=3600',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const byFips = await fetchSoilMoistureForStates(CONTINENTAL_FIPS);

    // Re-key from FIPS → state abbreviation for easier client-side lookup
    const states: Record<string, SoilMoisture> = {};
    for (const [fips, moisture] of Object.entries(byFips)) {
      const abbr = FIPS_STATE[fips];
      if (abbr) states[abbr] = moisture;
    }

    const data: SoilMoistureMapData = { states, fetchedAt: Date.now() };
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, stale-while-revalidate=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const msg = error instanceof Error ? error.message : 'Failed to fetch soil moisture data';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
