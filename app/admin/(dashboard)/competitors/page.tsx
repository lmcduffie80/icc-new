import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { CompetitorsClient } from './competitors-client';

export interface CompetitorRow {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  search_template: string | null;
  is_active: boolean;
  listing_count: number;
  ok_count: number;
  failed_count: number;
  not_found_count: number;
  last_fetched_at: string | null;
}

export interface CompetitorListingRow {
  id: string;
  competitor_name: string;
  product_name: string;
  normalized_active_ingredient: string;
  concentration_percent: number | null;
  price: number | null;
  unit_of_measure: string | null;
  container_size: string | null;
  source_url: string | null;
  fetch_status: 'ok' | 'failed' | 'not_found';
  last_fetched_at: string;
}

async function getCompetitors(): Promise<CompetitorRow[]> {
  return query<CompetitorRow>(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.base_url,
      c.search_template,
      c.is_active,
      COUNT(cp.id)::int AS listing_count,
      COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'ok')::int AS ok_count,
      COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'failed')::int AS failed_count,
      COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'not_found')::int AS not_found_count,
      MAX(cp.last_fetched_at)::text AS last_fetched_at
    FROM competitors c
    LEFT JOIN competitor_products cp ON cp.competitor_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);
}

async function getRecentListings(): Promise<CompetitorListingRow[]> {
  return query<CompetitorListingRow>(`
    SELECT
      cp.id,
      c.name AS competitor_name,
      cp.product_name,
      cp.normalized_active_ingredient,
      cp.concentration_percent::float AS concentration_percent,
      cp.price::float AS price,
      cp.unit_of_measure,
      cp.container_size,
      cp.source_url,
      cp.fetch_status,
      cp.last_fetched_at::text AS last_fetched_at
    FROM competitor_products cp
    JOIN competitors c ON c.id = cp.competitor_id
    ORDER BY cp.last_fetched_at DESC
    LIMIT 200
  `);
}

export default async function CompetitorsPage() {
  const session = await getAdminSession();
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const canManage = session.permissions.includes('products.update');

  const [competitors, listings] = await Promise.all([
    getCompetitors(),
    getRecentListings(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Competitor Pricing</h1>
        <p className="mt-1 text-slate-500">
          Manage competing distributors and trigger manual pricing refreshes. The nightly cron at
          03:00 UTC refreshes all active competitors automatically.
        </p>
      </div>
      <CompetitorsClient
        initialCompetitors={competitors}
        initialListings={listings}
        canManage={canManage}
      />
    </div>
  );
}
