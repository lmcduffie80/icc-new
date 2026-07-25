import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';

export interface ProductListItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  original_price: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  attributes: {
    containerSizes?: string;
  } | null;
}

// GET /api/products - List all products for the caller's tenant (public)
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  let tenantId: string;
  try {
    tenantId = getRequiredTenantId(request);
  } catch (err) {
    if (err instanceof MissingTenantError) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 });
    }
    throw err;
  }

  try {
    // Rate limiting - relaxed (60 req/min) for public shop browsing
    // This endpoint is read-only with caching, so it's safe to be more permissive
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/products', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Validate search parameter length to prevent abuse
    if (search && search.length > 100) {
      securityLogger.logValidationFailure('/api/products', ip, 'Search query too long', 'GET');
      return NextResponse.json({ error: 'Search query too long' }, { status: 400 });
    }

    let sql = `
      SELECT id, name, category, description, price, original_price, unit_of_measure, image,
        (inventory_count > 0 OR COALESCE(icc_available_quantity, 0) > 0 OR in_stock) AS in_stock,
        attributes
      FROM products
      WHERE deleted_at IS NULL
        AND tenant_id = $1
        AND (supplier_id IS NULL OR approval_status = 'published')
    `;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (category && category !== 'all') {
      sql += ` AND LOWER(category) = LOWER($${paramIndex++})`;
      params.push(category);
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC LIMIT 100'; // Add limit for performance

    const products = await query<ProductListItem>(sql, params);
    return NextResponse.json(products, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/products',
      method: 'GET',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'low',
    });
    
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}
