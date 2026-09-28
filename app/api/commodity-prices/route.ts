import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitResponse, rateLimiters } from '@/lib/rate-limit';
import {
  fetchSoilMoistureForStates,
  CORN_BELT_FIPS,
  FIPS_STATE,
} from '@/lib/smap';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommodityCategory = 'crop' | 'fertilizer' | 'input';

export type DroughtAlert = {
  /** e.g. 'DROUGHT_IA' */
  id: string;
  /** e.g. 'Iowa' */
  stateName: string;
  /** e.g. 'IA' */
  stateAbbr: string;
  /** Mean soil moisture (m³/m³) */
  soilMoisture: number;
  /** 'drought' | 'dry' */
  severity: 'drought' | 'dry';
};

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

// CME/ICE/KCBT front-month futures via Yahoo Finance.
// Grain/oilseed quotes arrive in cents (USX); `scale: 0.01` converts to $/bu.
// Cotton is quoted in cents/lb (scale: 1). Rice and soy oil are already in
// their display unit (scale: 1).
const CROP_FUTURES: Array<{
  ticker: string;
  name: string;
  unit: string;
  scale: number;
  category: CommodityCategory;
}> = [
  // ── Grains (CBOT) ──────────────────────────────────────────────────────────
  { ticker: 'ZC=F',  name: 'Corn',         unit: '$/bu',  category: 'crop', scale: 0.01 },
  { ticker: 'ZS=F',  name: 'Soybeans',     unit: '$/bu',  category: 'crop', scale: 0.01 },
  { ticker: 'ZW=F',  name: 'SRW Wheat',    unit: '$/bu',  category: 'crop', scale: 0.01 },
  { ticker: 'KE=F',  name: 'HRW Wheat',    unit: '$/bu',  category: 'crop', scale: 0.01 },
  { ticker: 'ZO=F',  name: 'Oats',         unit: '$/bu',  category: 'crop', scale: 0.01 },
  { ticker: 'ZR=F',  name: 'Rough Rice',   unit: '$/cwt', category: 'crop', scale: 1    },
  // ── Oilseeds / fiber ───────────────────────────────────────────────────────
  { ticker: 'ZL=F',  name: 'Soybean Oil',  unit: '¢/lb',  category: 'crop', scale: 1    },
  { ticker: 'CT=F',  name: 'Cotton',       unit: '¢/lb',  category: 'crop', scale: 1    },
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

// ─── IndexMundi scrapers for non-exchange crops ───────────────────────────────
// IndexMundi publishes World Bank monthly commodity prices. The HTML chart
// embeds data points as:  <set label='Mon YYYY' value='NNN.NN' />
// We take the last two points to derive a month-over-month change.

// Slugs verified against the IndexMundi commodity list — only slugs that
// actually return <set label=... value=...> chart data are included here.
// barley, sorghum, oats, and rough-rice pages exist on IndexMundi but ship
// no chart data; those crops are instead covered by Yahoo Finance futures
// (ZO=F for oats, ZR=F for rough rice) or omitted.
const INDEXMUNDI_CROPS: Array<{
  slug: string;       // IndexMundi commodity slug
  symbol: string;     // internal symbol for deduplication
  name: string;
  unit: string;
  category: CommodityCategory;
}> = [
  { slug: 'peanuts',      symbol: 'PEANUTS', name: 'Peanuts',      unit: '$/mt', category: 'crop' },
  { slug: 'sugar',        symbol: 'SUGAR',   name: 'Sugar (Raw)',   unit: '¢/lb', category: 'crop' },
  { slug: 'sunflower-oil',symbol: 'SUNFL',   name: 'Sunflowers',   unit: '$/mt', category: 'crop' },
  { slug: 'rapeseed-oil', symbol: 'CANOLA',  name: 'Canola (Oil)', unit: '$/mt', category: 'crop' },
  { slug: 'soybean-meal', symbol: 'SOYMEAL', name: 'Soy Meal',     unit: '$/mt', category: 'crop' },
];

async function fetchIndexMundiQuote(
  def: (typeof INDEXMUNDI_CROPS)[number]
): Promise<CommodityQuote | null> {
  try {
    const res = await fetch(
      `https://www.indexmundi.com/commodities/?commodity=${def.slug}&months=12`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const points = [...html.matchAll(/<set label='([^']+)' value='([\d.]+)'/g)]
      .map((m) => ({ label: m[1], price: parseFloat(m[2]) }))
      .filter((p) => Number.isFinite(p.price));
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    if (!last) return null;
    const change = prev ? last.price - prev.price : 0;
    const changePercent = prev && prev.price !== 0 ? (change / prev.price) * 100 : 0;
    return {
      symbol: def.symbol,
      name: def.name,
      price: last.price,
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

async function fetchIndexMundiQuotes(): Promise<CommodityQuote[]> {
  const results = await Promise.all(INDEXMUNDI_CROPS.map(fetchIndexMundiQuote));
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
    const [cropQuotes, indexMundiQuotes] = await Promise.all([
      fetchCropFutures(),
      fetchIndexMundiQuotes(),
    ]);

    const quotes = [...cropQuotes, ...indexMundiQuotes];
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
