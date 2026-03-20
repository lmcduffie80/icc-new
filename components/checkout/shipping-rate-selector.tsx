'use client';

import { Loader2, Truck, AlertCircle, RefreshCw } from 'lucide-react';
import type { FreightRate } from '@/lib/freight-quote';

interface ShippingRateSelectorProps {
  rates: FreightRate[];
  selectedQuoteId: string | null;
  onSelect: (rate: FreightRate) => void;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
}

/**
 * Parse a ShipBoss est_delivery_date string like "Fri, May 3" into a comparable Date.
 * Uses the current year as a baseline. Returns null if parsing fails.
 */
function parseDeliveryDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'Estimated delivery varies') return null;
  try {
    const currentYear = new Date().getFullYear();
    const parsed = new Date(`${dateStr}, ${currentYear}`);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Find the index of the cheapest rate and the fastest rate in the list.
 * If cheapest and fastest are the same, fastestIndex will equal cheapestIndex.
 */
function findHighlightedIndexes(rates: FreightRate[]): {
  cheapestIndex: number;
  fastestIndex: number;
} {
  if (rates.length === 0) return { cheapestIndex: -1, fastestIndex: -1 };

  // Cheapest: lowest price (rates are already sorted by price from ShipBoss)
  let cheapestIndex = 0;
  for (let i = 1; i < rates.length; i++) {
    if (rates[i].price < rates[cheapestIndex].price) {
      cheapestIndex = i;
    }
  }

  // Fastest: earliest est_delivery_date
  let fastestIndex = -1;
  let fastestDate: Date | null = null;

  for (let i = 0; i < rates.length; i++) {
    const d = parseDeliveryDate(rates[i].estDeliveryDate ?? rates[i].transitDays);
    if (d !== null) {
      if (fastestDate === null || d < fastestDate) {
        fastestDate = d;
        fastestIndex = i;
      }
    }
  }

  // If no dates were parseable, don't show a fastest badge at all
  if (fastestIndex === -1) {
    fastestIndex = cheapestIndex; // same index → only "Best Value" badge shown
  }

  return { cheapestIndex, fastestIndex };
}

export function ShippingRateSelector({
  rates,
  selectedQuoteId,
  onSelect,
  loading,
  error,
  onRetry,
}: ShippingRateSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Fetching shipping rates…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-destructive underline-offset-2 hover:underline hover:cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        )}
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        No shipping rates available for this address.
      </div>
    );
  }

  const { cheapestIndex, fastestIndex } = findHighlightedIndexes(rates);

  return (
    <div className="space-y-2">
      {rates.map((rate, index) => {
        const isSelected = rate.quoteId === selectedQuoteId;
        const isCheapest = index === cheapestIndex;
        const isFastest = index === fastestIndex && fastestIndex !== cheapestIndex;

        return (
          <button
            key={rate.quoteId}
            type="button"
            onClick={() => onSelect(rate)}
            className={`w-full rounded-xl border px-4 py-4 text-left transition-all hover:cursor-pointer ${
              isSelected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2 ${isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Truck className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">
                      {rate.carrier} — {rate.service}
                    </p>
                    {isCheapest && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Best Value
                      </span>
                    )}
                    {isFastest && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        Fastest Delivery
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{rate.transitDays}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-foreground">
                  {formatPrice(rate.price)}
                </span>
                <div className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                }`}>
                  {isSelected && (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
