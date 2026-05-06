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

const STOOQ_COMMODITIES: Array<{
  stooq: string;
  name: string;
  unit: string;
  category: CommodityCategory;
}> = [
  // Crop futures (CBOT / CME)
  { stooq: 'zc.f',  name: 'Corn',          unit: '¢/bu',  category: 'crop' },
  { stooq: 'zs.f',  name: 'Soybeans',      unit: '¢/bu',  category: 'crop' },
  { stooq: 'zw.f',  name: 'Wheat',         unit: '¢/bu',  category: 'crop' },
  { stooq: 'zl.f',  name: 'Soybean Oil',   unit: '¢/lb',  category: 'crop' },
  { stooq: 'zm.f',  name: 'Soybean Meal',  unit: '$/ton', category: 'crop' },
  { stooq: 'ct.f',  name: 'Cotton',        unit: '¢/lb',  category: 'crop' },
  { stooq: 'le.f',  name: 'Live Cattle',   unit: '¢/lb',  category: 'crop' },
  { stooq: 'gf.f',  name: 'Feeder Cattle', unit: '¢/lb',  category: 'crop' },
  { stooq: 'he.f',  name: 'Lean Hogs',     unit: '¢/lb',  category: 'crop' },
  // Key production input
  { stooq: 'ng.f',  name: 'Natural Gas',   unit: '$/MMBtu', category: 'input' },
];

// Fertilizer market indicators — major publicly traded fertilizer companies.
// These trade on NYSE/NASDAQ and are accessible via Yahoo Finance v8 chart API.
const FERTILIZER_STOCKS: Array<{
  ticker: string;
  name: string;
  category: CommodityCategory;
}> = [
  { ticker: 'NTR',  name: 'Nutrien',       category: 'fertilizer' },
  { ticker: 'MOS',  name: 'Mosaic',        category: 'fertilizer' },
  { ticker: 'CF',   name: 'CF Industries', category: 'fertilizer' },
  { ticker: 'UAN',  name: 'CVR Partners',  category: 'fertilizer' },
];

// ─── In-memory cache (shared across serverless invocations in the same worker) ─

let cache: { data: CommodityQuote[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Stooq CSV fetcher ────────────────────────────────────────────────────────

// Stooq CSV format: Symbol,Date,Time,Open,High,Low,Close,Volume
function parseStooqCsv(
  csv: string,
  def: (typeof STOOQ_COMMODITIES)[number]
): CommodityQuote {
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
    category: def.category,
    updatedAt: Date.now(),
  };
}

async function fetchStooqQuotes(): Promise<CommodityQuote[]> {
  const results = await Promise.allSettled(
    STOOQ_COMMODITIES.map(async (def) => {
      const url = `https://stooq.com/q/l/?s=${def.stooq}&f=sd2t2ohlcv&h&e=csv`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`Stooq ${res.status} for ${def.stooq}`);
      const csv = await res.text();
      return parseStooqCsv(csv, def);
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<CommodityQuote> => r.status === 'fulfilled')
    .map((r) => r.value);
}

// ─── Yahoo Finance v8 fetcher (fertilizer stocks) ────────────────────────────

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

async function fetchYahooStockQuote(
  def: (typeof FERTILIZER_STOCKS)[number]
): Promise<CommodityQuote | null> {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${def.ticker}` +
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

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: def.ticker,
      name: def.name,
      price,
      change,
      changePercent,
      unit: '$/share',
      category: def.category,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchFertilizerQuotes(): Promise<CommodityQuote[]> {
  const results = await Promise.all(FERTILIZER_STOCKS.map(fetchYahooStockQuote));
  return results.filter((q): q is CommodityQuote => q !== null);
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
    const [stooqQuotes, fertilizerQuotes] = await Promise.all([
      fetchStooqQuotes(),
      fetchFertilizerQuotes(),
    ]);

    const quotes = [...stooqQuotes, ...fertilizerQuotes];
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
