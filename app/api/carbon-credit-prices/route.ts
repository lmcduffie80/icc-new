import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';

export type CarbonCreditPrices = {
  none: number;
  voluntary: number;
  verified: number;
  premium: number;
  source: string;
  updatedAt: number;
  live: boolean;
};

// Fallback prices reflect 2026 voluntary carbon market conditions after the VCM correction.
// none       = entry-tier unverified credits (low-score plans can still trade on informal markets)
// voluntary  = standard voluntary offsets
// verified   = nature-based reference (N-GEO class)
// premium    = high-quality removals (CORC / Gold Standard premium)
const FALLBACK_PRICES = { none: 3, voluntary: 8, verified: 15, premium: 45 } as const;

let cache: { data: CarbonCreditPrices; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

// CME N-GEO (Nature-Based Global Emissions Offset) futures via Stooq
async function fetchLiveNgeoPrice(): Promise<number | null> {
  try {
    const url = 'https://stooq.com/q/l/?s=ngo.f&f=sd2t2ohlcv&h&e=csv';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    const close = parseFloat(cols[6]);
    if (!isFinite(close) || close <= 0) return null;
    return close;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=900', 'X-Cache': 'HIT' },
    });
  }

  const ngeoPrice = await fetchLiveNgeoPrice();

  const data: CarbonCreditPrices = ngeoPrice
    ? {
        // Scale tiers off the live N-GEO price (verified = reference).
        none: Math.round(ngeoPrice * 0.2 * 100) / 100,
        voluntary: Math.round(ngeoPrice * 0.55 * 100) / 100,
        verified: Math.round(ngeoPrice * 100) / 100,
        premium: Math.round(ngeoPrice * 3.0 * 100) / 100,
        source: 'CME N-GEO Futures (Stooq)',
        updatedAt: Date.now(),
        live: true,
      }
    : {
        ...FALLBACK_PRICES,
        source: '2026 VCM market reference',
        updatedAt: Date.now(),
        live: false,
      };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=900',
      'X-Cache': 'MISS',
    },
  });
}
