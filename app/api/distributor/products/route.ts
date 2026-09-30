import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface DistributorProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  retail_price: number;
  distributor_price: number;
  discount_percent: number | null;
  price_override: number | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  unit_of_measure: string | null;
  container_size: string | null;
}

// GET /api/distributor/products?tenant_id=xxx
// Returns all active products with distributor pricing for authenticated distributors only.
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    securityLogger.logSuspiciousActivity('distributor_products_unauthenticated', ip, {});
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify distributor status
  const profile = await queryOne<{ is_distributor: boolean }>(
    `SELECT COALESCE(is_distributor, false) AS is_distributor FROM user_profiles WHERE user_id = $1`,
    [session.user.id]
  );

  if (!profile?.is_distributor) {
    securityLogger.logSuspiciousActivity('distributor_products_not_distributor', ip, {
      userId: session.user.id,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenant_id');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  const products = await query<DistributorProduct>(
    `SELECT
       p.id,
       p.name,
       p.category,
       p.description,
       p.price::float AS retail_price,
       CASE
         WHEN dp.price_override IS NOT NULL THEN dp.price_override::float
         WHEN dp.discount_percent IS NOT NULL THEN ROUND(p.price * (1 - dp.discount_percent / 100.0), 2)::float
         ELSE p.price::float
       END AS distributor_price,
       dp.discount_percent::float,
       dp.price_override::float,
       p.image,
       p.in_stock,
       p.inventory_count,
       p.unit_of_measure,
       p.attributes->>'containerSizes' AS container_size
     FROM products p
     LEFT JOIN distributor_pricing dp ON dp.product_id = p.id AND dp.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1
       AND p.deleted_at IS NULL
       AND p.in_stock = true
     ORDER BY p.category ASC, p.name ASC`,
    [tenantId]
  );

  return NextResponse.json(products);
}
