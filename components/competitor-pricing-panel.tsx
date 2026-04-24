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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data || loading) return;
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
  }, [open, data, loading, productId]);

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
          {loading && (
            <p className="text-sm text-muted-foreground">Loading competitor pricing…</p>
          )}
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
        Matched by active ingredient:{' '}
        <span className="font-medium text-foreground">{data.matchedIngredient.display}</span>
        {data.matchedIngredient.concentration !== null && (
          <> at {data.matchedIngredient.concentration}%</>
        )}
      </p>
      <div className="rounded-md border bg-background">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Competitor</span>
          <span className="text-right">Their price</span>
          <span className="text-right">Savings vs us</span>
          <span className="text-right">Source</span>
        </div>
        {data.competitors.map((row) => (
          <div
            key={row.competitorId}
            className="grid grid-cols-[1fr_auto_auto_auto] items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0"
          >
            <div>
              <div className="font-medium text-foreground">{row.competitorName}</div>
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
              {row.price !== null ? (
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
              <SavingsBadge savings={row.savingsVsOurs} />
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
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Prices are fetched automatically from competitor sites and may change. Follow the source
        link for the most accurate listing.
      </p>
    </div>
  );
}

function SavingsBadge({ savings }: { savings: number | null }) {
  if (savings === null) return <span className="text-muted-foreground">—</span>;
  if (savings > 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        We save {formatPrice(savings)}
      </span>
    );
  }
  if (savings < 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Them {formatPrice(Math.abs(savings))} cheaper
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
      Even
    </span>
  );
}
