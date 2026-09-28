'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { StockQuote, StockTickerResponse } from '@/app/api/stock-ticker/route';

// ─── Individual ticker item ───────────────────────────────────────────────────

function TickerItem({ quote }: { quote: StockQuote }) {
  const isPositive = quote.change > 0;
  const isNegative = quote.change < 0;

  const changeColor = isPositive
    ? 'text-emerald-400'
    : isNegative
      ? 'text-red-400'
      : 'text-slate-400';

  const ChangeIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <span className="inline-flex items-center gap-2 border-r border-slate-700 px-5 py-1 last:border-r-0">
      <span className="text-xs font-bold tracking-wide text-white">{quote.name}</span>
      <span className="font-mono text-xs tabular-nums text-slate-200">
        {quote.price.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
      <span className={`inline-flex items-center gap-0.5 font-mono text-xs tabular-nums font-medium ${changeColor}`}>
        <ChangeIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        {isPositive ? '+' : ''}
        {quote.change.toFixed(2)}{' '}
        <span className="opacity-80">
          ({isPositive ? '+' : ''}
          {quote.changePercent.toFixed(2)}%)
        </span>
      </span>
    </span>
  );
}

// ─── Marquee track ────────────────────────────────────────────────────────────

function MarqueeTrack({ quotes }: { quotes: StockQuote[] }) {
  return (
    <>
      {/*
       * Inject the keyframe once in the document. Using a plain <style> tag
       * inside a client component is idiomatic for component-scoped animations
       * that can't be expressed as Tailwind utility classes.
       */}
      <style>{`
        @keyframes icc-stock-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .icc-stock-track {
          display: flex;
          width: max-content;
          will-change: transform;
          animation: icc-stock-scroll 40s linear infinite;
        }
        .icc-stock-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="icc-stock-track" aria-hidden="true">
        {/* Render twice — second copy creates the seamless loop */}
        {quotes.map((q) => (
          <TickerItem key={q.symbol} quote={q} />
        ))}
        {quotes.map((q) => (
          <TickerItem key={`${q.symbol}--2`} quote={q} />
        ))}
      </div>
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * StockMarketTicker
 *
 * Displays a horizontally scrolling banner of major US market indices
 * (S&P 500, DJIA, NASDAQ, Russell 2000). Data is fetched from the
 * /api/stock-ticker route, which caches the upstream Yahoo Finance
 * response for 24 hours. The component renders nothing until data is
 * available so it never causes a layout shift on load.
 *
 * Pause-on-hover is handled entirely in CSS for accessibility
 * (respects prefers-reduced-motion via the parent card).
 */
export function StockMarketTicker() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);

  useEffect(() => {
    fetch('/api/stock-ticker')
      .then((res) => (res.ok ? (res.json() as Promise<StockTickerResponse>) : Promise.reject()))
      .then((data) => {
        if (data.quotes?.length) setQuotes(data.quotes);
      })
      .catch(() => {
        // Silently suppress — ticker is an enhancement, not critical content
      });
  }, []);

  if (quotes.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-t-md bg-slate-900"
      role="marquee"
      aria-label="US stock market indices"
    >
      <div className="flex items-stretch">
        {/* "Markets" label pinned at the left */}
        <div className="flex shrink-0 items-center bg-primary px-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary-foreground">
            Markets
          </span>
        </div>

        {/* Scrolling content */}
        <div className="overflow-hidden flex-1 py-1">
          <MarqueeTrack quotes={quotes} />
        </div>
      </div>
    </div>
  );
}
