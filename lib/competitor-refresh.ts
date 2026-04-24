/**
 * Shared orchestration for the competitor pricing refresh. Used by both the
 * nightly Vercel Cron at `/api/cron/refresh-competitor-pricing` and the
 * admin manual-trigger at `/api/admin/competitors/refresh`.
 *
 * Given a scope (all, single ingredient, or single product) this module:
 *   1. Collects distinct normalized active ingredients from `products`.
 *   2. Loads active competitors from `competitors`.
 *   3. Calls the AI fetch agent per (competitor, ingredient) pair with a
 *      bounded concurrency limit.
 *   4. Upserts results into `competitor_products` with status `ok`,
 *      `not_found`, or `failed`.
 */

import { query } from './db';
import { primaryActiveIngredient, type ParsedIngredient } from './competitor-match';
import {
  fetchCompetitorListings,
  type CompetitorInfo,
  type CompetitorListing,
} from './competitor-pricing';

export interface RefreshScope {
  /** Limit to a single product (by id) — derives its primary ingredient. */
  productId?: string;
  /** Limit to a single ingredient (matches `normalized_active_ingredient`). */
  ingredient?: string;
  /** Limit to a single competitor (by id or slug). */
  competitorId?: string;
  /** Maximum parallel AI calls. Default: 3. */
  concurrency?: number;
}

export interface RefreshSummary {
  ingredientsProcessed: number;
  competitorsProcessed: number;
  listingsUpserted: number;
  notFound: number;
  failed: number;
  errors: Array<{ competitor: string; ingredient: string; reason: string }>;
}

interface ProductIngredientRow {
  attributes: Record<string, string> | null;
}

/** Fetch the distinct set of parsed primary active ingredients to refresh. */
async function collectIngredients(scope: RefreshScope): Promise<ParsedIngredient[]> {
  let rows: ProductIngredientRow[] = [];

  if (scope.productId) {
    rows = await query<ProductIngredientRow>(
      `SELECT attributes FROM products WHERE id = $1 AND COALESCE(deleted_at, NULL) IS NULL`,
      [scope.productId]
    );
  } else {
    rows = await query<ProductIngredientRow>(
      `SELECT attributes
         FROM products
        WHERE attributes ? 'activeIngredients'
          AND COALESCE(deleted_at, NULL) IS NULL`
    );
  }

  const byKey = new Map<string, ParsedIngredient>();
  for (const row of rows) {
    const raw = row.attributes?.activeIngredients;
    const parsed = primaryActiveIngredient(raw);
    if (!parsed) continue;
    if (scope.ingredient && parsed.normalized !== scope.ingredient.toLowerCase()) continue;
    const key = `${parsed.normalized}|${parsed.concentration ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, parsed);
  }
  return Array.from(byKey.values());
}

async function collectCompetitors(scope: RefreshScope): Promise<CompetitorInfo[]> {
  if (scope.competitorId) {
    return query<CompetitorInfo>(
      `SELECT id, name, base_url, search_template
         FROM competitors
        WHERE is_active = true
          AND (id = $1 OR slug = $1)
        ORDER BY name ASC`,
      [scope.competitorId]
    );
  }
  return query<CompetitorInfo>(
    `SELECT id, name, base_url, search_template
       FROM competitors
      WHERE is_active = true
      ORDER BY name ASC`
  );
}

/** Upsert a successful listing into competitor_products. */
async function upsertListing(
  competitorId: string,
  ingredient: ParsedIngredient,
  listing: CompetitorListing
): Promise<void> {
  await query(
    `INSERT INTO competitor_products (
       competitor_id, product_name, normalized_active_ingredient,
       concentration_percent, price, unit_of_measure, container_size,
       source_url, last_fetched_at, fetch_status, raw_response, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'ok', $9, NOW()
     )
     ON CONFLICT (competitor_id, normalized_active_ingredient, COALESCE(concentration_percent, -1))
       WHERE fetch_status = 'ok'
     DO UPDATE SET
       product_name = EXCLUDED.product_name,
       price = EXCLUDED.price,
       unit_of_measure = EXCLUDED.unit_of_measure,
       container_size = EXCLUDED.container_size,
       source_url = EXCLUDED.source_url,
       last_fetched_at = EXCLUDED.last_fetched_at,
       raw_response = EXCLUDED.raw_response,
       updated_at = NOW()`,
    [
      competitorId,
      listing.productName,
      ingredient.normalized,
      ingredient.concentration,
      listing.price,
      listing.unitOfMeasure,
      listing.containerSize,
      listing.sourceUrl,
      JSON.stringify(listing),
    ]
  );
}

async function recordNonOk(
  competitorId: string,
  ingredient: ParsedIngredient,
  status: 'failed' | 'not_found',
  reason: string
): Promise<void> {
  // The partial unique index only covers rows with fetch_status='ok', so
  // non-ok rows are simply inserted as an audit trail — no upsert needed.
  await query(
    `INSERT INTO competitor_products (
       competitor_id, product_name, normalized_active_ingredient,
       concentration_percent, fetch_status, raw_response, last_fetched_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, NOW()
     )`,
    [
      competitorId,
      ingredient.display,
      ingredient.normalized,
      ingredient.concentration,
      status,
      JSON.stringify({ reason }),
    ]
  );
}

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Refresh competitor pricing for the given scope.
 *
 * Always returns a summary — individual pair failures are recorded in the DB
 * and rolled up into `summary.failed` / `summary.errors` so a single bad run
 * doesn't abort the whole refresh.
 */
export async function refreshCompetitorPricing(
  scope: RefreshScope = {}
): Promise<RefreshSummary> {
  const [ingredients, competitors] = await Promise.all([
    collectIngredients(scope),
    collectCompetitors(scope),
  ]);

  const summary: RefreshSummary = {
    ingredientsProcessed: ingredients.length,
    competitorsProcessed: competitors.length,
    listingsUpserted: 0,
    notFound: 0,
    failed: 0,
    errors: [],
  };

  if (ingredients.length === 0 || competitors.length === 0) return summary;

  const pairs: Array<{ competitor: CompetitorInfo; ingredient: ParsedIngredient }> = [];
  for (const competitor of competitors) {
    for (const ingredient of ingredients) {
      pairs.push({ competitor, ingredient });
    }
  }

  await pMap(
    pairs,
    async ({ competitor, ingredient }) => {
      const outcome = await fetchCompetitorListings(competitor, ingredient);
      if (outcome.status === 'ok') {
        for (const listing of outcome.listings) {
          try {
            await upsertListing(competitor.id, ingredient, listing);
            summary.listingsUpserted++;
          } catch (err) {
            summary.failed++;
            summary.errors.push({
              competitor: competitor.name,
              ingredient: ingredient.display,
              reason: err instanceof Error ? err.message : 'upsert failed',
            });
          }
        }
      } else if (outcome.status === 'not_found') {
        summary.notFound++;
        try {
          await recordNonOk(competitor.id, ingredient, 'not_found', outcome.reason);
        } catch {
          // audit insert failure is non-fatal
        }
      } else {
        summary.failed++;
        summary.errors.push({
          competitor: competitor.name,
          ingredient: ingredient.display,
          reason: outcome.reason,
        });
        try {
          await recordNonOk(competitor.id, ingredient, 'failed', outcome.reason);
        } catch {
          // audit insert failure is non-fatal
        }
      }
    },
    scope.concurrency ?? 3
  );

  return summary;
}
