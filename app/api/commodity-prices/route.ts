import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';

export type CommodityQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  updatedAt: number;
};

const COMMODITIES = [
  { stooq: 'zc.f',  name: 'Corn',     unit: '/bu' },
  { stooq: 'zs.f',  name: 'Soybeans', unit: '/bu' },
  { stooq: 'zw.f',  name: 'Wheat',    unit: '/bu' },
  { stooq: 'ct.f',  name: 'Cotton',   unit: '/lb' },
];

let cache: { data: CommodityQuote[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Stooq CSV format: Symbol,Date,Time,Open,High,Low,Close,Volume
function parseStooqCsv(csv: string, def: typeof COMMODITIES[number]): CommodityQuote {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error(`No data for ${def.stooq}`);
  const cols = lines[1].split(',');
  const open  = parseFloat(cols[3]);
  const close = parseFloat(cols[6]);
  const change = close - open;
  const changePercent = open !== 0 ? (change / open) * 100 : 0;
  return {
    symbol: def.stooq.toUpperCase(),
    name: def.name,
    price: close,
    change,
    changePercent,
    unit: def.unit,
    updatedAt: Date.now(),
  };
}

async function fetchCommodityPrices(): Promise<CommodityQuote[]> {
  const results = await Promise.all(
    COMMODITIES.map(async (def) => {
      const url = `https://stooq.com/q/l/?s=${def.stooq}&f=sd2t2ohlcv&h&e=csv`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`Stooq returned ${res.status} for ${def.stooq}`);
      const csv = await res.text();
      return parseStooqCsv(csv, def);
    })
  );
  return results;
}

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json({ quotes: cache.data }, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' },
    });
  }

  try {
    const quotes = await fetchCommodityPrices();
    cache = { data: quotes, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json({ quotes }, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    if (cache) {
      return NextResponse.json({ quotes: cache.data, stale: true }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const msg = error instanceof Error ? error.message : 'Failed to fetch commodity prices';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
