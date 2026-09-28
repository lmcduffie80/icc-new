import { NextResponse } from 'next/server';

// Revalidate once per day — matches the "update everyday" requirement.
export const revalidate = 86400;

const SYMBOLS = ['^GSPC', '^DJI', '^IXIC', '^RUT'];

const DISPLAY_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'DJIA',
  '^IXIC': 'NASDAQ',
  '^RUT': 'Russell 2000',
};

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface StockTickerResponse {
  quotes: StockQuote[];
  timestamp: string;
}

interface YahooQuote {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

/**
 * GET /api/stock-ticker
 *
 * Returns latest quotes for the four major US market indices.
 * Response is edge-cached for 24 hours (revalidate = 86400).
 * Fetches from Yahoo Finance's public quote endpoint — no API key required.
 */
export async function GET() {
  try {
    const encoded = SYMBOLS.map((s) => encodeURIComponent(s)).join(',');
    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${encoded}` +
      `&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent`;

    const res = await fetch(url, {
      headers: {
        // Yahoo Finance returns 429 without a browser-style UA on some PoPs
        'User-Agent':
          'Mozilla/5.0 (compatible; ICC-StockTicker/1.0)',
        Accept: 'application/json',
      },
      // Next.js fetch cache — honour the route-level revalidate
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.error(`[stock-ticker] Yahoo Finance responded with ${res.status}`);
      return NextResponse.json(
        { error: 'Upstream data unavailable' },
        { status: 502 }
      );
    }

    const body = await res.json() as {
      quoteResponse: { result: YahooQuote[]; error: unknown };
    };

    const results = body?.quoteResponse?.result ?? [];

    const quotes: StockQuote[] = results
      .filter(
        (q) =>
          q.regularMarketPrice !== undefined &&
          q.regularMarketChange !== undefined &&
          q.regularMarketChangePercent !== undefined
      )
      .map((q) => ({
        symbol: q.symbol,
        name: DISPLAY_NAMES[q.symbol] ?? q.shortName ?? q.symbol,
        price: q.regularMarketPrice!,
        change: q.regularMarketChange!,
        changePercent: q.regularMarketChangePercent!,
      }));

    const response: StockTickerResponse = {
      quotes,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('[stock-ticker] Failed to fetch stock data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock data' },
      { status: 500 }
    );
  }
}
