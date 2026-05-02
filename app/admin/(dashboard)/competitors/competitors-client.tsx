'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { CompetitorRow, CompetitorListingRow } from './page';

/**
 * Tiny competitor product thumbnail. Falls back to a placeholder when the
 * URL is missing or the image fails to load. Uses a plain <img> rather than
 * next/image because competitor hostnames are unbounded (especially under
 * the open-web bucket).
 */
function ListingThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded border bg-slate-100 text-[8px] uppercase text-slate-400">
        —
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className="h-8 w-8 rounded border bg-white object-contain"
    />
  );
}

type StatusFilter = 'all' | 'ok' | 'failed' | 'not_found' | 'stale';

interface Props {
  initialCompetitors: CompetitorRow[];
  initialListings: CompetitorListingRow[];
  canManage: boolean;
}

function isStale(iso: string): boolean {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return true;
  return Date.now() - then > 48 * 60 * 60 * 1000;
}

export function CompetitorsClient({ initialCompetitors, initialListings, canManage }: Props) {
  const router = useRouter();
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggleActive = async (competitor: CompetitorRow) => {
    if (!canManage) return;
    const next = !competitor.is_active;
    setCompetitors((list) =>
      list.map((c) => (c.id === competitor.id ? { ...c, is_active: next } : c))
    );
    try {
      const res = await fetch('/api/admin/competitors', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: competitor.id, is_active: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setCompetitors((list) =>
        list.map((c) =>
          c.id === competitor.id ? { ...c, is_active: !next } : c
        )
      );
      setMessage(`Failed to update ${competitor.name}: ${(err as Error).message}`);
    }
  };

  const handleRefreshOne = async (competitor: CompetitorRow) => {
    if (!canManage) return;
    setRefreshing((r) => ({ ...r, [competitor.id]: true }));
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/competitors/refresh?competitorId=${encodeURIComponent(competitor.id)}`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refresh failed');
      setMessage(
        `${competitor.name}: upserted ${json.summary.listingsUpserted}, not found ${json.summary.notFound}, failed ${json.summary.failed}`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(`Refresh failed for ${competitor.name}: ${(err as Error).message}`);
    } finally {
      setRefreshing((r) => ({ ...r, [competitor.id]: false }));
    }
  };

  const handleRefreshAll = async () => {
    if (!canManage) return;
    setGlobalRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/competitors/refresh', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refresh failed');
      setMessage(
        `Full refresh: upserted ${json.summary.listingsUpserted}, not found ${json.summary.notFound}, failed ${json.summary.failed}`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(`Full refresh failed: ${(err as Error).message}`);
    } finally {
      setGlobalRefreshing(false);
    }
  };

  const filteredListings = initialListings.filter((l) => {
    if (statusFilter === 'ok' && l.fetch_status !== 'ok') return false;
    if (statusFilter === 'failed' && l.fetch_status !== 'failed') return false;
    if (statusFilter === 'not_found' && l.fetch_status !== 'not_found') return false;
    if (statusFilter === 'stale' && !isStale(l.last_fetched_at)) return false;
    if (
      ingredientFilter &&
      !l.normalized_active_ingredient.toLowerCase().includes(ingredientFilter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-md border bg-muted/40 px-4 py-2 text-sm" role="status">
          {message}
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Competitors</h2>
          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={handleRefreshAll}
              disabled={globalRefreshing}
            >
              {globalRefreshing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing all…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh all competitors
                </>
              )}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Competitor</th>
                <th className="px-4 py-3">Base URL</th>
                <th className="px-4 py-3 text-right">Listings</th>
                <th className="px-4 py-3 text-right">OK / Not found / Failed</th>
                <th className="px-4 py-3">Last fetched</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">
                    {c.base_url ? (
                      <a
                        href={c.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {c.base_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs italic text-slate-500">
                        Open web (any retailer)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {c.listing_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {c.ok_count} / {c.not_found_count} / {c.failed_count}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.last_fetched_at
                      ? new Date(c.last_fetched_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={c.is_active}
                        onChange={() => handleToggleActive(c)}
                        disabled={!canManage}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-slate-600">
                        {c.is_active ? 'On' : 'Off'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRefreshOne(c)}
                        disabled={!!refreshing[c.id]}
                      >
                        {refreshing[c.id] ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Refreshing
                          </>
                        ) : (
                          'Refresh now'
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent listings</h2>
          <div className="flex gap-2">
            {(['all', 'ok', 'not_found', 'failed', 'stale'] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={statusFilter === status ? 'default' : 'outline'}
                onClick={() => setStatusFilter(status)}
              >
                {status.replace('_', ' ')}
              </Button>
            ))}
          </div>
          <input
            type="text"
            value={ingredientFilter}
            onChange={(e) => setIngredientFilter(e.target.value)}
            placeholder="Filter by ingredient…"
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          />
          <span className="text-xs text-slate-500">
            Showing {filteredListings.length} of {initialListings.length}
          </span>
        </div>
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 w-16">Image</th>
                <th className="px-4 py-3">Competitor</th>
                <th className="px-4 py-3">Ingredient</th>
                <th className="px-4 py-3">Packaging</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last fetched</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-3">
                    <ListingThumbnail src={l.image_url} alt={l.product_name} />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {l.retailer_name ?? l.competitor_name}
                    {l.retailer_name && (
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        via {l.competitor_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {l.normalized_active_ingredient}
                    {l.concentration_percent !== null && ` · ${l.concentration_percent}%`}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {l.package_canonical ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {l.product_name}
                    {l.container_size ? ` · ${l.container_size}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {l.price !== null ? formatPrice(l.price) : '—'}
                    {l.unit_of_measure && (
                      <span className="text-xs text-slate-500">/{l.unit_of_measure}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        l.fetch_status === 'ok'
                          ? 'text-emerald-700'
                          : l.fetch_status === 'not_found'
                          ? 'text-slate-500'
                          : 'text-red-700'
                      }
                    >
                      {l.fetch_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-slate-600 ${
                      isStale(l.last_fetched_at) ? 'text-amber-700' : ''
                    }`}
                  >
                    {new Date(l.last_fetched_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {l.source_url ? (
                      <a
                        href={l.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {filteredListings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    No listings match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
