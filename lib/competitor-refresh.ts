/**
 * Shared orchestration for the competitor pricing refresh. Used by both the
 * nightly Vercel Cron at `/api/cron/refresh-competitor-pricing` and the
 * admin manual-trigger at `/api/admin/competitors/refresh`.
 *
 * Given a scope (all, single ingredient, or single product) this module:
 *   1. Collects distinct (normalized active ingredient × packaging) tuples
 *      from `products`. Same ingredient at different packaging sizes
 *      (e.g. 2.5 gal vs 30 gal glyphosate) are independent fetches so
 *      competitor results match the actual SKU shape.
 *   2. Loads active competitors from `competitors`. The seeded "Open Web"
 *      pseudo-competitor (base_url = NULL) participates like any other —
 *      the agent layer drops `allowedDomains` for that one.
 *   3. Calls the AI fetch agent per (competitor, ingredient, packaging)
 *      tuple with a bounded concurrency limit.
 *   4. Upserts results into `competitor_products` with status `ok`,
 *      `not_found`, or `failed`, including the packaging columns added
 *      in migration 091.
 */

import { query } from './db';
import {
  parsePackaging,
  primaryActiveIngredient,
  type ParsedIngredient,
  type ParsedPackaging,
} from './competitor-match';
import { fetchOgImage } from './competitor-image';
import {
  fetchCompetitorListings,
  type CompetitorInfo,
  type CompetitorListing,
} from './competitor-pricing';

export interface RefreshScope {
  /** Limit to a single product (by id) — derives its primary ingredient + packaging. */
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
  unit_of_measure: string | null;
}

interface IngredientPackaging {
  ingredient: ParsedIngredient;
  packaging: ParsedPackaging | null;
}

/**
 * Fetch the distinct set of (parsed primary ingredient × packaging) tuples
 * to refresh. A glyphosate 41% product sold as both 2.5 gal and 30 gal
 * generates two tuples so each container size gets its own competitor scan.
 */
async function collectIngredientPackagings(
  scope: RefreshScope
): Promise<IngredientPackaging[]> {
  let rows: ProductIngredientRow[] = [];

  if (scope.productId) {
    rows = await query<ProductIngredientRow>(
      `SELECT attributes, unit_of_measure
         FROM products
        WHERE id = $1
          AND COALESCE(deleted_at, NULL) IS NULL`,
      [scope.productId]
    );
  } else {
    rows = await query<ProductIngredientRow>(
      `SELECT attributes, unit_of_measure
         FROM products
        WHERE attributes ? 'activeIngredients'
          AND COALESCE(deleted_at, NULL) IS NULL`
    );
  }

  const byKey = new Map<string, IngredientPackaging>();
  for (const row of rows) {
    const raw = row.attributes?.activeIngredients;
    const ingredient = primaryActiveIngredient(raw);
    if (!ingredient) continue;
    if (scope.ingredient && ingredient.normalized !== scope.ingredient.toLowerCase()) continue;

    const containerSizes = row.attributes?.containerSizes ?? null;
    const packaging = parsePackaging(containerSizes, row.unit_of_measure);

    const key = [
      ingredient.normalized,
      ingredient.concentration ?? '',
      packaging?.canonical ?? '',
    ].join('|');
    if (!byKey.has(key)) byKey.set(key, { ingredient, packaging });
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
  packaging: ParsedPackaging | null,
  listing: CompetitorListing
): Promise<void> {
  // Prefer the packaging the agent reported on the listing itself, falling
  // back to the requested packaging when the listing didn't include a
  // parseable size.
  const effectivePackaging = listing.packaging ?? packaging;

  // The Claude web-search agent only returns image URLs that are inline in
  // the search snippet text it sees, which is rarely a usable product
  // image. As a fallback, fetch the source page directly and pull the
  // og:image / twitter:image meta tag — almost every modern e-commerce
  // template emits one. Best-effort: failures (timeouts, blocked bots,
  // non-HTML responses) leave imageUrl as null so the UI shows its
  // placeholder instead.
  let imageUrl = listing.imageUrl;
  if (!imageUrl && listing.sourceUrl) {
    imageUrl = await fetchOgImage(listing.sourceUrl);
  }

  await query(
    `INSERT INTO competitor_products (
       competitor_id, product_name, normalized_active_ingredient,
       concentration_percent, price, unit_of_measure, container_size,
       source_url, last_fetched_at, fetch_status, raw_response,
       package_canonical, package_size_value, package_size_unit, retailer_name,
       image_url, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'ok', $9,
       $10, $11, $12, $13, $14, NOW()
     )
     ON CONFLICT (
       competitor_id, normalized_active_ingredient,
       COALESCE(concentration_percent, -1),
       COALESCE(package_canonical, ''),
       COALESCE(source_url, '')
     )
       WHERE fetch_status = 'ok'
     DO UPDATE SET
       product_name = EXCLUDED.product_name,
       price = EXCLUDED.price,
       unit_of_measure = EXCLUDED.unit_of_measure,
       container_size = EXCLUDED.container_size,
       source_url = EXCLUDED.source_url,
       last_fetched_at = EXCLUDED.last_fetched_at,
       raw_response = EXCLUDED.raw_response,
       package_canonical = EXCLUDED.package_canonical,
       package_size_value = EXCLUDED.package_size_value,
       package_size_unit = EXCLUDED.package_size_unit,
       retailer_name = EXCLUDED.retailer_name,
       image_url = EXCLUDED.image_url,
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
      effectivePackaging?.canonical ?? null,
      effectivePackaging?.sizeValue ?? null,
      effectivePackaging?.sizeUnit ?? null,
      listing.retailerName,
      imageUrl,
    ]
  );
}

async function recordNonOk(
  competitorId: string,
  ingredient: ParsedIngredient,
  packaging: ParsedPackaging | null,
  status: 'failed' | 'not_found',
  reason: string
): Promise<void> {
  // The partial unique index only covers rows with fetch_status='ok', so
  // non-ok rows are simply inserted as an audit trail — no upsert needed.
  await query(
    `INSERT INTO competitor_products (
       competitor_id, product_name, normalized_active_ingredient,
       concentration_percent, fetch_status, raw_response, last_fetched_at,
       package_canonical, package_size_value, package_size_unit
     ) VALUES (
       $1, $2, $3, $4, $5, $6, NOW(),
       $7, $8, $9
     )`,
    [
      competitorId,
      ingredient.display,
      ingredient.normalized,
      ingredient.concentration,
      status,
      JSON.stringify({ reason }),
      packaging?.canonical ?? null,
      packaging?.sizeValue ?? null,
      packaging?.sizeUnit ?? null,
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
  const [tuples, competitors] = await Promise.all([
    collectIngredientPackagings(scope),
    collectCompetitors(scope),
  ]);

  const summary: RefreshSummary = {
    ingredientsProcessed: tuples.length,
    competitorsProcessed: competitors.length,
    listingsUpserted: 0,
    notFound: 0,
    failed: 0,
    errors: [],
  };

  if (tuples.length === 0 || competitors.length === 0) return summary;

  const pairs: Array<{
    competitor: CompetitorInfo;
    ingredient: ParsedIngredient;
    packaging: ParsedPackaging | null;
  }> = [];
  for (const competitor of competitors) {
    for (const { ingredient, packaging } of tuples) {
      pairs.push({ competitor, ingredient, packaging });
    }
  }

  await pMap(
    pairs,
    async ({ competitor, ingredient, packaging }) => {
      const outcome = await fetchCompetitorListings(competitor, ingredient, packaging);
      const ingredientLabel = packaging
        ? `${ingredient.display} · ${packaging.display}`
        : ingredient.display;

      if (outcome.status === 'ok') {
        for (const listing of outcome.listings) {
          try {
            await upsertListing(competitor.id, ingredient, packaging, listing);
            summary.listingsUpserted++;
          } catch (err) {
            summary.failed++;
            summary.errors.push({
              competitor: competitor.name,
              ingredient: ingredientLabel,
              reason: err instanceof Error ? err.message : 'upsert failed',
            });
          }
        }
      } else if (outcome.status === 'not_found') {
        summary.notFound++;
        try {
          await recordNonOk(competitor.id, ingredient, packaging, 'not_found', outcome.reason);
        } catch {
          // audit insert failure is non-fatal
        }
      } else {
        summary.failed++;
        summary.errors.push({
          competitor: competitor.name,
          ingredient: ingredientLabel,
          reason: outcome.reason,
        });
        try {
          await recordNonOk(competitor.id, ingredient, packaging, 'failed', outcome.reason);
        } catch {
          // audit insert failure is non-fatal
        }
      }
    },
    scope.concurrency ?? 3
  );

  return summary;
}
