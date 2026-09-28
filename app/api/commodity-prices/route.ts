import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommodityCategory = 'crop' | 'fertilizer' | 'input';

export type CommodityQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: CommodityCategory;
  updatedAt: number;
};

// ─── Symbol definitions ───────────────────────────────────────────────────────

// CME/ICE front-month futures via Yahoo Finance. Grain quotes arrive in cents
// (USX); `scale` converts corn, soybeans, and wheat to dollars per bushel.
// Cotton is already quoted in cents per pound.
const CROP_FUTURES: Array<{
  ticker: string;
  name: string;
  unit: string;
  scale: number;
  category: CommodityCategory;
}> = [
  { ticker: 'ZC=F', name: 'Corn',     unit: '$/bu', category: 'crop', scale: 0.01 },
  { ticker: 'ZS=F', name: 'Soybeans', unit: '$/bu', category: 'crop', scale: 0.01 },
  { ticker: 'ZW=F', name: 'Wheat',    unit: '$/bu', category: 'crop', scale: 0.01 },
  { ticker: 'CT=F', name: 'Cotton',   unit: '¢/lb', category: 'crop', scale: 1 },
];

// ─── In-memory cache (shared across serverless invocations in the same worker) ─

let cache: { data: CommodityQuote[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Yahoo Finance v8 fetcher (crop futures) ─────────────────────────────────

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

async function fetchYahooFuture(
  def: (typeof CROP_FUTURES)[number]
): Promise<CommodityQuote | null> {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.ticker)}` +
    `?interval=1d&range=1d&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const body = await res.json() as { chart?: { result?: { meta: YahooChartMeta }[] } };
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const raw = meta.regularMarketPrice;
    const rawPrev = meta.previousClose ?? meta.chartPreviousClose ?? raw;
    const price = raw * def.scale;
    const prev = rawPrev * def.scale;
    const change = price - prev;
    const changePercent = prev !== 0 ? (change / prev) * 100 : 0;

    return {
      symbol: def.ticker,
      name: def.name,
      price,
      change,
      changePercent,
      unit: def.unit,
      category: def.category,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchCropFutures(): Promise<CommodityQuote[]> {
  const results = await Promise.all(CROP_FUTURES.map(fetchYahooFuture));
  return results.filter((q): q is CommodityQuote => q !== null);
}

// Peanuts have no exchange futures. IndexMundi publishes the World Bank
// monthly groundnut price ($/metric ton) with a month-over-month change.
async function fetchPeanutQuote(): Promise<CommodityQuote | null> {
  try {
    const res = await fetch(
      'https://www.indexmundi.com/commodities/?commodity=peanuts&months=12',
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const cells = [...html.matchAll(/<td[^>]*>(.*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').replace(/,/g, '').trim()
    );
    const rows: { price: number; pct: number }[] = [];
    for (let i = 0; i + 2 < cells.length; i += 3) {
      const price = parseFloat(cells[i]);
      const pct = parseFloat(cells[i + 1].replace('%', ''));
      if (!Number.isFinite(price) || !Number.isFinite(pct)) continue;
      rows.push({ price, pct });
    }
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    if (!last) return null;
    return {
      symbol: 'PEANUTS',
      name: 'Peanuts',
      price: last.price,
      change: prev ? last.price - prev.price : 0,
      changePercent: last.pct,
      unit: '$/mt',
      category: 'crop',
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
    const [cropQuotes, peanut] = await Promise.all([
      fetchCropFutures(),
      fetchPeanutQuote(),
    ]);

    const quotes = peanut ? [...cropQuotes, peanut] : cropQuotes;
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
