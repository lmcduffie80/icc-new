'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { CommodityQuote, CommodityCategory } from '@/app/api/commodity-prices/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number, unit: string): string {
  // Prices under $10 (like natural gas) show 3 decimal places;
  // prices over $100 (like soybean meal) show 2; everything else 2.
  const decimals = price < 10 ? 3 : 2;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + unit;
}

// ─── Single item ──────────────────────────────────────────────────────────────

function TickerItem({ quote }: { quote: CommodityQuote }) {
  const isUp = quote.change > 0;
  const isDown = quote.change < 0;

  const colorClass = isUp
    ? 'text-emerald-400'
    : isDown
      ? 'text-red-400'
      : 'text-slate-400';

  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <span className="inline-flex items-center gap-1.5 border-r border-slate-700 px-4 py-1 last:border-r-0">
      <span className="text-xs font-bold tracking-wide text-white">{quote.name}</span>
      <span className="font-mono text-xs tabular-nums text-slate-200">
        {formatPrice(quote.price, quote.unit)}
      </span>
      <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums font-medium ${colorClass}`}>
        <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        {isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
      </span>
    </span>
  );
}

// ─── Section divider label ────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 border-r border-slate-600 bg-slate-800 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-300">
      {label}
    </span>
  );
}

// ─── Marquee track ────────────────────────────────────────────────────────────

const CATEGORY_ORDER: CommodityCategory[] = ['crop', 'fertilizer', 'input'];

const CATEGORY_LABELS: Record<CommodityCategory, string> = {
  crop:       'Crop Prices',
  fertilizer: 'Fertilizer Market',
  input:      'Key Inputs',
};

function buildTickerItems(quotes: CommodityQuote[]): React.ReactNode[] {
  const groups = CATEGORY_ORDER
    .map((cat) => ({
      cat,
      items: quotes.filter((q) => q.category === cat),
    }))
    .filter(({ items }) => items.length > 0);

  const nodes: React.ReactNode[] = [];
  groups.forEach(({ cat, items }) => {
    nodes.push(<SectionLabel key={`lbl-${cat}`} label={CATEGORY_LABELS[cat]} />);
    items.forEach((q) => nodes.push(<TickerItem key={q.symbol} quote={q} />));
  });
  return nodes;
}

interface MarqueeProps {
  quotes: CommodityQuote[];
}

function MarqueeTrack({ quotes }: MarqueeProps) {
  const items = buildTickerItems(quotes);

  return (
    <>
      <style>{`
        @keyframes icc-commodity-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .icc-commodity-track {
          display: flex;
          width: max-content;
          will-change: transform;
          animation: icc-commodity-scroll 60s linear infinite;
        }
        .icc-commodity-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="icc-commodity-track" aria-hidden="true">
        {/* Render twice for seamless looping */}
        {items}
        {items.map((node, i) =>
          node && typeof node === 'object' && 'key' in node
            ? { ...node as React.ReactElement, key: `dup-${(node as React.ReactElement).key}` }
            : <span key={`dup-${i}`}>{node}</span>
        )}
      </div>
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * CommodityTickerBanner
 *
 * Full-width scrolling ticker displaying live US commodity market data
 * relevant to farmers: crop futures (corn, soybeans, wheat, cotton, cattle,
 * hogs, soybean oil/meal), fertilizer market indicators (Nutrien, Mosaic,
 * CF Industries, CVR Partners), and key production inputs (natural gas).
 *
 * Data is fetched from /api/commodity-prices, which caches upstream results
 * for 5 minutes. Hover pauses the scroll. Renders nothing until data arrives.
 */
export function CommodityTickerBanner() {
  const [quotes, setQuotes] = useState<CommodityQuote[]>([]);

  useEffect(() => {
    fetch('/api/commodity-prices')
      .then((res) => (res.ok ? (res.json() as Promise<{ quotes: CommodityQuote[] }>) : Promise.reject()))
      .then((data) => {
        if (data.quotes?.length) setQuotes(data.quotes);
      })
      .catch(() => {/* silently suppress — banner is an enhancement */});
  }, []);

  if (quotes.length === 0) return null;

  return (
    <div
      className="w-full bg-slate-900"
      role="marquee"
      aria-label="US agricultural commodity and fertilizer market prices"
    >
      <div className="flex items-stretch">
        {/* Pinned label */}
        <div className="flex shrink-0 flex-col items-center justify-center bg-primary px-3 py-1.5">
          <span className="text-[9px] font-black uppercase leading-tight tracking-widest text-primary-foreground">
            Markets
          </span>
        </div>

        {/* Scrolling content */}
        <div className="overflow-hidden flex-1">
          <MarqueeTrack quotes={quotes} />
        </div>
      </div>
    </div>
  );
}
