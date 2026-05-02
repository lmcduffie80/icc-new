import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import {
  parsePackaging,
  primaryActiveIngredient,
  concentrationsMatch,
  computePricePerGallon,
  convertToGallons,
  type ParsedIngredient,
  type ParsedPackaging,
} from '@/lib/competitor-match';
import { getGallonsFromContainerSize } from '@/lib/utils';

interface ProductRow {
  id: string;
  name: string;
  price: string;
  unit_of_measure: string | null;
  attributes: Record<string, string> | null;
}

interface CompetitorRow {
  id: string;
  competitor_id: string;
  competitor_name: string;
  competitor_slug: string;
  product_name: string;
  price: string | null;
  unit_of_measure: string | null;
  container_size: string | null;
  source_url: string | null;
  last_fetched_at: string | null;
  fetch_status: 'ok' | 'failed' | 'not_found';
  concentration_percent: string | null;
  package_canonical: string | null;
  package_size_value: string | null;
  package_size_unit: string | null;
  retailer_name: string | null;
  image_url: string | null;
}

export interface CompetitorPricingResponse {
  ours: {
    productId: string;
    name: string;
    price: number;
    unitOfMeasure: string | null;
    packaging: {
      canonical: string;
      display: string;
    } | null;
    /** Per-gallon price for the ICC SKU. NULL when the SKU isn't a volume product (e.g. 50 lb bag). */
    pricePerGallon: number | null;
  };
  matchedIngredient: {
    normalized: string;
    display: string;
    concentration: number | null;
  } | null;
  competitors: Array<{
    competitorId: string;
    competitorName: string;
    competitorSlug: string;
    /** For open-web hits, the actual retailer name (e.g. "Tractor Supply"). NULL for domain-locked competitors. */
    retailerName: string | null;
    productName: string;
    /** Direct image URL on the competitor's product page (for Amazon-style thumbnails). */
    imageUrl: string | null;
    price: number | null;
    /** Competitor's price normalized to USD/gal (only set when their packaging is a volume unit). */
    pricePerGallon: number | null;
    unitOfMeasure: string | null;
    containerSize: string | null;
    /** Canonical packaging key on the competitor row (NULL for legacy rows pre-migration 091). */
    packageCanonical: string | null;
    sourceUrl: string | null;
    lastFetchedAt: string | null;
    fetchStatus: 'ok' | 'failed' | 'not_found';
    /** Difference in absolute total price (competitorPrice - ourPrice). Negative = they're cheaper. */
    savingsVsOurs: number | null;
    /** Difference in $/gal (competitorPerGal - ourPerGal). NULL when either side has no per-gallon price. */
    savingsPerGallonVsOurs: number | null;
  }>;
}

/**
 * GET /api/products/:id/competitor-pricing
 *
 * Returns competitor pricing rows for the primary active ingredient + packaging
 * of the requested ICC product. Cached for 15 minutes since data only changes
 * at most once per night.
 *
 * Matching rules:
 *   - Active ingredient match (normalized) is required.
 *   - Concentration must be within tolerance (see `concentrationsMatch`).
 *   - Packaging must match canonically (e.g. "2.5gal") OR the competitor row
 *     must have NULL packaging (legacy rows before migration 091 — those still
 *     surface so we don't drop historic data on day one).
 *   - The same retailer can return multiple distinct rows (one per source URL),
 *     which lets the open-web bucket surface several competing retailers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const product = await queryOne<ProductRow>(
      `SELECT id, name, price, unit_of_measure, attributes
         FROM products
        WHERE id = $1
          AND deleted_at IS NULL
          AND (supplier_id IS NULL OR approval_status = 'published')`,
      [id]
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const ingredient: ParsedIngredient | null = primaryActiveIngredient(
      product.attributes?.activeIngredients
    );
    const packaging: ParsedPackaging | null = parsePackaging(
      product.attributes?.containerSizes,
      product.unit_of_measure
    );

    const ourPrice = Number(product.price);
    const safeOurPrice = Number.isFinite(ourPrice) ? ourPrice : 0;

    // Compute the ICC per-gallon price using the SAME logic the storefront
    // already displays (e.g. "$16.00/gal" on a 265 Gal tote). The legacy
    // `getGallonsFromContainerSize` handles the special "265 Gal" / "2x2.5
    // Gal" tokens, so we prefer it; we fall back to the generic
    // packaging-based computation for products whose containerSizes parses
    // cleanly as <number> <unit> but isn't in the legacy lookup.
    const legacyGallons = getGallonsFromContainerSize(
      product.attributes?.containerSizes ?? null
    );
    const ourPricePerGallon =
      legacyGallons !== null && legacyGallons > 0 && safeOurPrice > 0
        ? Math.round((safeOurPrice / legacyGallons) * 100) / 100
        : computePricePerGallon(safeOurPrice > 0 ? safeOurPrice : null, packaging);

    const base: CompetitorPricingResponse = {
      ours: {
        productId: product.id,
        name: product.name,
        price: safeOurPrice,
        unitOfMeasure: product.unit_of_measure,
        packaging: packaging
          ? { canonical: packaging.canonical, display: packaging.display }
          : null,
        pricePerGallon: ourPricePerGallon,
      },
      matchedIngredient: ingredient
        ? {
            normalized: ingredient.normalized,
            display: ingredient.display,
            concentration: ingredient.concentration,
          }
        : null,
      competitors: [],
    };

    if (!ingredient) {
      return cachedJson(base);
    }

    // Pull listings matching the ingredient. Packaging filter is applied in
    // SQL so we don't pull rows we'd immediately drop in the JS filter step.
    // The `package_canonical IS NULL` branch keeps legacy rows from
    // disappearing after the migration ships but before the next nightly run.
    //
    // DISTINCT ON includes (competitor_id, source_url) so the open-web bucket
    // can surface multiple retailers in the same response — without it,
    // PostgreSQL would collapse all open-web rows down to a single arbitrary
    // retailer per fetch run.
    const rows = await query<CompetitorRow>(
      `SELECT DISTINCT ON (cp.competitor_id, COALESCE(cp.source_url, ''))
              cp.id,
              cp.competitor_id,
              c.name AS competitor_name,
              c.slug AS competitor_slug,
              cp.product_name,
              cp.price::text AS price,
              cp.unit_of_measure,
              cp.container_size,
              cp.source_url,
              cp.last_fetched_at::text AS last_fetched_at,
              cp.fetch_status,
              cp.concentration_percent::text AS concentration_percent,
              cp.package_canonical,
              cp.package_size_value::text AS package_size_value,
              cp.package_size_unit,
              cp.retailer_name,
              cp.image_url
         FROM competitor_products cp
         JOIN competitors c ON c.id = cp.competitor_id AND c.is_active = true
        WHERE cp.normalized_active_ingredient = $1
          AND (
            $2::text IS NULL
            OR cp.package_canonical IS NULL
            OR cp.package_canonical = $2::text
          )
        ORDER BY cp.competitor_id,
                 COALESCE(cp.source_url, ''),
                 CASE WHEN cp.fetch_status = 'ok' THEN 0 ELSE 1 END,
                 cp.last_fetched_at DESC`,
      [ingredient.normalized, packaging?.canonical ?? null]
    );

    const filtered = rows.filter((row) => {
      if (row.concentration_percent === null) return true;
      const concentration = Number(row.concentration_percent);
      return concentrationsMatch(ingredient.concentration, concentration);
    });

    base.competitors = filtered
      .map((row) => {
        const competitorPrice = row.price !== null ? Number(row.price) : null;
        const savings =
          competitorPrice !== null && base.ours.price > 0
            ? Number((competitorPrice - base.ours.price).toFixed(2))
            : null;

        // Compute the competitor's per-gallon price from their packaging.
        // If the competitor row predates migration 091 (NULL package size),
        // we still try to derive packaging from container_size on the fly so
        // legacy rows surface a $/gal value when possible.
        const sizeValue = row.package_size_value !== null ? Number(row.package_size_value) : null;
        const sizeUnit = row.package_size_unit as ParsedPackaging['sizeUnit'] | null;
        let competitorPerGal: number | null = null;
        if (sizeValue !== null && sizeUnit !== null && competitorPrice !== null) {
          const gallons = convertToGallons(sizeValue, sizeUnit);
          if (gallons !== null && gallons > 0) {
            competitorPerGal = Math.round((competitorPrice / gallons) * 100) / 100;
          }
        } else if (competitorPrice !== null) {
          const fallbackPackaging = parsePackaging(row.container_size, row.unit_of_measure);
          competitorPerGal = computePricePerGallon(competitorPrice, fallbackPackaging);
        }

        const savingsPerGallon =
          competitorPerGal !== null && base.ours.pricePerGallon !== null
            ? Number((competitorPerGal - base.ours.pricePerGallon).toFixed(2))
            : null;

        return {
          competitorId: row.competitor_id,
          competitorName: row.competitor_name,
          competitorSlug: row.competitor_slug,
          retailerName: row.retailer_name,
          productName: row.product_name,
          imageUrl: row.image_url,
          price: competitorPrice,
          pricePerGallon: competitorPerGal,
          unitOfMeasure: row.unit_of_measure,
          containerSize: row.container_size,
          packageCanonical: row.package_canonical,
          sourceUrl: row.source_url,
          lastFetchedAt: row.last_fetched_at,
          fetchStatus: row.fetch_status,
          savingsVsOurs: savings,
          savingsPerGallonVsOurs: savingsPerGallon,
        };
      })
      .sort((a, b) => {
        // When both sides have $/gal, sort by that (apples-to-apples). Otherwise
        // fall back to absolute price. Rows without any price sink to the bottom.
        const aPg = a.pricePerGallon;
        const bPg = b.pricePerGallon;
        if (aPg !== null && bPg !== null) return aPg - bPg;
        if (a.price === null && b.price === null) return 0;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });

    return cachedJson(base);
  } catch (error) {
    console.error('[API] Failed to load competitor pricing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function cachedJson(body: CompetitorPricingResponse) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
