'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { CompetitorPricingResponse } from '@/app/api/products/[id]/competitor-pricing/route';

interface CompetitorPricingPanelProps {
  productId: string;
  /** Start expanded. Defaults to collapsed to avoid noise on PDP. */
  defaultOpen?: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  const diffMs = Date.now() - then;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CompetitorPricingPanel({ productId, defaultOpen = false }: CompetitorPricingPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState<CompetitorPricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prefetch competitor pricing on mount instead of waiting for the user to
  // expand the panel. The route is edge-cached (s-maxage=900) so the request
  // is cheap on repeat views; eagerly firing it means the data is usually
  // ready by the time the user clicks "Show", eliminating the perceived
  // "Loading…" delay reported by users.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/products/${productId}/competitor-pricing`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json() as Promise<CompetitorPricingResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Competitor Pricing</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`competitor-pricing-${productId}`}
          >
            {open ? (
              <>
                Hide <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                Show <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent id={`competitor-pricing-${productId}`} className="pt-0">
          {loading && <PanelSkeleton />}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && data && <PanelBody data={data} />}
        </CardContent>
      )}
    </Card>
  );
}

function PanelBody({ data }: { data: CompetitorPricingResponse }) {
  if (!data.matchedIngredient) {
    return (
      <p className="text-sm text-muted-foreground">
        No active ingredient is recorded for this product, so we can&apos;t match competitor listings.
      </p>
    );
  }

  if (data.competitors.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          No competitor listings found yet for{' '}
          <span className="font-medium text-foreground">{data.matchedIngredient.display}</span>.
          The nightly refresh will try again.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Matched by:{' '}
        <span className="font-medium text-foreground">{data.matchedIngredient.display}</span>
        {data.matchedIngredient.concentration !== null && (
          <> at {data.matchedIngredient.concentration}%</>
        )}
        {data.ours.packaging && (
          <>
            {' '}·{' '}
            <span className="font-medium text-foreground">{data.ours.packaging.display}</span>
          </>
        )}
        {data.ours.pricePerGallon !== null && (
          <>
            {' '}·{' '}
            <span className="font-medium text-foreground">
              Our price: {formatPrice(data.ours.pricePerGallon)}/gal
            </span>
          </>
        )}
      </p>
      <div className="rounded-md border bg-background">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Competitor</span>
          <span className="text-right">Their price</span>
          <span className="text-right">Savings vs us</span>
          <span className="text-right">Source</span>
        </div>
        {data.competitors.map((row) => {
          // For open-web hits the bucket name is "Open Web"; surface the actual
          // retailer (e.g. "Tractor Supply") so the panel reads naturally.
          const displayName = row.retailerName ?? row.competitorName;
          const rowKey = `${row.competitorId}-${row.sourceUrl ?? row.productName}`;
          return (
          <div
            key={rowKey}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0"
          >
            <CompetitorThumbnail src={row.imageUrl} alt={row.productName} sourceUrl={row.sourceUrl} />
            <div>
              <div className="font-medium text-foreground">
                {displayName}
                {row.retailerName && (
                  <span className="ml-1 text-xs text-muted-foreground">via {row.competitorName}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.productName || '—'}
                {row.containerSize ? ` · ${row.containerSize}` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                Last checked {timeAgo(row.lastFetchedAt)}
                {row.fetchStatus !== 'ok' && ` · ${row.fetchStatus.replace('_', ' ')}`}
              </div>
            </div>
            <div className="text-right font-mono text-sm tabular-nums">
              {row.pricePerGallon !== null ? (
                <>
                  <div>{formatPrice(row.pricePerGallon)}<span className="text-xs text-muted-foreground">/gal</span></div>
                  {row.price !== null && (
                    <div className="text-xs text-muted-foreground">
                      {formatPrice(row.price)}
                      {row.containerSize ? ` / ${row.containerSize}` : ''}
                    </div>
                  )}
                </>
              ) : row.price !== null ? (
                <>
                  {formatPrice(row.price)}
                  {row.unitOfMeasure && (
                    <span className="text-xs text-muted-foreground">/{row.unitOfMeasure}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="text-right font-mono text-sm tabular-nums">
              <SavingsBadge
                savings={row.savingsPerGallonVsOurs ?? row.savingsVsOurs}
                perGallon={row.savingsPerGallonVsOurs !== null}
              />
            </div>
            <div className="text-right">
              {row.sourceUrl ? (
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Prices and product images are fetched automatically from competitor sites and may change.
        Follow the source link for the most accurate listing.
      </p>
    </div>
  );
}

/**
 * Lightweight skeleton shown while the competitor pricing fetch is in
 * flight. Mirrors the actual row layout (thumbnail + name/sub + price +
 * savings + source) so the panel doesn't visually jump when data arrives.
 */
function PanelSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      <div className="rounded-md border bg-background">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0"
          >
            <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
            <div className="space-y-1.5">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-48 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-10 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Small competitor product image. Falls back to a neutral placeholder when
 * the URL is missing or the image fails to load (cross-origin sites can
 * 403/hotlink-block at any time). Wrapped in an anchor when a sourceUrl is
 * available so users can click through Amazon-style.
 */
function CompetitorThumbnail({
  src,
  alt,
  sourceUrl,
}: {
  src: string | null;
  alt: string;
  sourceUrl: string | null;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  const inner = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element -- competitor hostnames are unbounded; next/image remote patterns can't whitelist them safely
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className="h-8 w-8 rounded-md border bg-white object-contain"
    />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-[8px] uppercase tracking-wide text-muted-foreground">
      —
    </div>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${alt} on competitor site`}
        className="block flex-shrink-0"
      >
        {inner}
      </a>
    );
  }
  return <div className="flex-shrink-0">{inner}</div>;
}

function SavingsBadge({
  savings,
  perGallon = false,
}: {
  savings: number | null;
  /** When true the savings are normalized to $/gal (apples-to-apples). */
  perGallon?: boolean;
}) {
  if (savings === null) return <span className="text-muted-foreground">—</span>;
  const suffix = perGallon ? '/gal' : '';
  if (savings > 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        We save {formatPrice(savings)}{suffix}
      </span>
    );
  }
  if (savings < 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Them {formatPrice(Math.abs(savings))}{suffix} cheaper
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
      Even
    </span>
  );
}
