'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import type { CommodityQuote } from '@/app/api/commodity-prices/route';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatPrice(price: number, unit: string): string {
  if (unit === '/lb') return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function QuoteCard({ quote }: { quote: CommodityQuote }) {
  const up = quote.change > 0;
  const down = quote.change < 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg min-w-[160px]">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">
          {quote.name}
        </p>
        <p className="text-base font-semibold tabular-nums">
          {quote.price > 0 ? formatPrice(quote.price, quote.unit) : '—'}
          <span className="text-xs text-muted-foreground font-normal ml-1">{quote.unit}</span>
        </p>
      </div>
      <div className={`flex flex-col items-end gap-0.5 text-xs tabular-nums ${up ? 'text-green-600' : down ? 'text-red-500' : 'text-muted-foreground'}`}>
        <div className="flex items-center gap-0.5">
          {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          <span>{up ? '+' : ''}{quote.changePercent.toFixed(2)}%</span>
        </div>
        <span className="text-[11px]">
          {up ? '+' : ''}{quote.change.toFixed(quote.unit === '/lb' ? 4 : 2)}
        </span>
      </div>
    </div>
  );
}

export function CommodityPriceBanner() {
  const [quotes, setQuotes] = useState<CommodityQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);

  const fetchPrices = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/commodity-prices');
      if (!res.ok) return;
      const data = await res.json() as { quotes: CommodityQuote[]; stale?: boolean };
      setQuotes(data.quotes ?? []);
      setStale(data.stale ?? false);
      setLastUpdated(new Date());
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices(true);
    const id = setInterval(() => fetchPrices(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 mb-8 animate-pulse">
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 w-40 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (quotes.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Commodity Prices</h2>
          <p className="text-xs text-muted-foreground">
            CME Futures · Updated {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            {stale && <span className="ml-1 text-yellow-600">(delayed)</span>}
          </p>
        </div>
        <button
          onClick={() => fetchPrices(true)}
          className="text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
          title="Refresh prices"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quotes.map((quote) => (
          <QuoteCard key={quote.symbol} quote={quote} />
        ))}
      </div>
    </div>
  );
}
