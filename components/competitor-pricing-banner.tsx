'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { CompetitorPricingResponse } from '@/app/api/products/[id]/competitor-pricing/route';

// ─── Single ticker item ───────────────────────────────────────────────────────

interface TickerItemProps {
  name: string;
  productName: string;
  pricePerGallon: number | null;
  price: number | null;
  containerSize: string | null;
  savingsPerGallon: number | null;
  savingsTotal: number | null;
  sourceUrl: string | null;
}

function TickerItem({
  name,
  productName,
  pricePerGallon,
  price,
  containerSize,
  savingsPerGallon,
  savingsTotal,
  sourceUrl,
}: TickerItemProps) {
  // Prefer per-gallon savings for apples-to-apples; fall back to total
  const savings = savingsPerGallon ?? savingsTotal;
  const isWeSave = savings !== null && savings > 0;
  const isThemCheaper = savings !== null && savings < 0;

  const priceDisplay = pricePerGallon !== null
    ? `${formatPrice(pricePerGallon)}/gal`
    : price !== null
      ? `${formatPrice(price)}${containerSize ? ` / ${containerSize}` : ''}`
      : '—';

  const savingsEl = savings !== null ? (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold ${
      isWeSave ? 'text-emerald-400' : isThemCheaper ? 'text-amber-400' : 'text-slate-400'
    }`}>
      {isWeSave
        ? <><TrendingUp className="h-2.5 w-2.5" aria-hidden="true" /> We save {formatPrice(Math.abs(savings))}{savingsPerGallon !== null ? '/gal' : ''}</>
        : isThemCheaper
          ? <><TrendingDown className="h-2.5 w-2.5" aria-hidden="true" /> Them {formatPrice(Math.abs(savings))}{savingsPerGallon !== null ? '/gal' : ''} cheaper</>
          : <><Minus className="h-2.5 w-2.5" aria-hidden="true" /> Even</>
      }
    </span>
  ) : null;

  const inner = (
    <span className="inline-flex items-center gap-2 border-r border-slate-700 px-5 py-1 last:border-r-0">
      <span className="text-xs font-bold tracking-wide text-white">{name}</span>
      {productName && (
        <span className="max-w-[160px] truncate text-[10px] text-slate-400">{productName}</span>
      )}
      <span className="font-mono text-xs tabular-nums text-slate-200">{priceDisplay}</span>
      {savingsEl}
    </span>
  );

  if (sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex hover:opacity-80 transition-opacity">
        {inner}
      </a>
    );
  }
  return inner;
}

// ─── Marquee track ────────────────────────────────────────────────────────────

function MarqueeTrack({ data }: { data: CompetitorPricingResponse }) {
  const items = data.competitors.filter((c) => c.price !== null || c.pricePerGallon !== null);

  if (items.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes icc-comp-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .icc-comp-track {
          display: flex;
          width: max-content;
          will-change: transform;
          animation: icc-comp-scroll 40s linear infinite;
        }
        .icc-comp-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="icc-comp-track" aria-hidden="true">
        {[0, 1].map((pass) =>
          items.map((c) => {
            const displayName = c.retailerName ?? c.competitorName;
            return (
              <TickerItem
                key={`${pass}-${c.competitorId}-${c.sourceUrl ?? c.productName}`}
                name={displayName}
                productName={c.productName}
                pricePerGallon={c.pricePerGallon}
                price={c.price}
                containerSize={c.containerSize}
                savingsPerGallon={c.savingsPerGallonVsOurs}
                savingsTotal={c.savingsVsOurs}
                sourceUrl={c.sourceUrl}
              />
            );
          })
        )}
      </div>
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * CompetitorPricingBanner
 *
 * Full-width scrolling ticker that runs directly below the site header on
 * product detail pages. Shows competitor prices for the current product,
 * colour-coded: emerald = we are cheaper, amber = they are cheaper.
 * Hover pauses the scroll. Clicking any item opens the competitor's listing.
 *
 * Renders nothing when there are no matching competitor rows, preserving the
 * page layout for products without pricing data.
 */
export function CompetitorPricingBanner({ productId }: { productId: string }) {
  const [data, setData] = useState<CompetitorPricingResponse | null>(null);

  useEffect(() => {
    fetch(`/api/products/${productId}/competitor-pricing`)
      .then((res) => (res.ok ? (res.json() as Promise<CompetitorPricingResponse>) : Promise.reject()))
      .then((json) => {
        // Only show if there are competitors with prices
        if (json.competitors.some((c) => c.price !== null || c.pricePerGallon !== null)) {
          setData(json);
        }
      })
      .catch(() => {/* silently suppress */});
  }, [productId]);

  if (!data) return null;

  return (
    <div
      className="w-full bg-slate-900"
      role="marquee"
      aria-label="Competitor pricing comparison"
    >
      <div className="flex items-stretch">
        {/* Pinned label */}
        <div className="flex shrink-0 flex-col items-center justify-center bg-primary px-3 py-1.5">
          <span className="text-[9px] font-black uppercase leading-tight tracking-widest text-primary-foreground">
            Competitor
          </span>
          <span className="text-[9px] font-black uppercase leading-tight tracking-widest text-primary-foreground">
            Pricing
          </span>
        </div>

        {/* Our price callout */}
        {data.ours.pricePerGallon !== null && (
          <div className="flex shrink-0 items-center border-r border-slate-700 px-3">
            <span className="text-[10px] text-slate-400">
              Our price:{' '}
              <span className="font-mono font-semibold text-white">
                {formatPrice(data.ours.pricePerGallon)}/gal
              </span>
            </span>
          </div>
        )}

        {/* Scrolling competitor items */}
        <div className="overflow-hidden flex-1">
          <MarqueeTrack data={data} />
        </div>
      </div>
    </div>
  );
}
