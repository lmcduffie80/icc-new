import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import {
  primaryActiveIngredient,
  concentrationsMatch,
  type ParsedIngredient,
} from '@/lib/competitor-match';

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
}

export interface CompetitorPricingResponse {
  ours: {
    productId: string;
    name: string;
    price: number;
    unitOfMeasure: string | null;
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
    productName: string;
    price: number | null;
    unitOfMeasure: string | null;
    containerSize: string | null;
    sourceUrl: string | null;
    lastFetchedAt: string | null;
    fetchStatus: 'ok' | 'failed' | 'not_found';
    savingsVsOurs: number | null;
  }>;
}

/**
 * GET /api/products/:id/competitor-pricing
 *
 * Returns competitor pricing rows for the primary active ingredient of the
 * requested ICC product. Cached for 15 minutes since data only changes at
 * most once per night.
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

    const ourPrice = Number(product.price);
    const base: CompetitorPricingResponse = {
      ours: {
        productId: product.id,
        name: product.name,
        price: Number.isFinite(ourPrice) ? ourPrice : 0,
        unitOfMeasure: product.unit_of_measure,
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

    // Pull the most recent row per competitor. Preference: fetch_status='ok'
    // over other statuses, then most recent last_fetched_at.
    const rows = await query<CompetitorRow>(
      `SELECT DISTINCT ON (cp.competitor_id)
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
              cp.concentration_percent::text AS concentration_percent
         FROM competitor_products cp
         JOIN competitors c ON c.id = cp.competitor_id AND c.is_active = true
        WHERE cp.normalized_active_ingredient = $1
        ORDER BY cp.competitor_id,
                 CASE WHEN cp.fetch_status = 'ok' THEN 0 ELSE 1 END,
                 cp.last_fetched_at DESC`,
      [ingredient.normalized]
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
        return {
          competitorId: row.competitor_id,
          competitorName: row.competitor_name,
          competitorSlug: row.competitor_slug,
          productName: row.product_name,
          price: competitorPrice,
          unitOfMeasure: row.unit_of_measure,
          containerSize: row.container_size,
          sourceUrl: row.source_url,
          lastFetchedAt: row.last_fetched_at,
          fetchStatus: row.fetch_status,
          savingsVsOurs: savings,
        };
      })
      .sort((a, b) => {
        // Put rows with prices first, sorted ascending by price
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
