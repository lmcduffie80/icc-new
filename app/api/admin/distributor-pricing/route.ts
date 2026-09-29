import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import { z } from 'zod';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

export interface DistributorPricingRow {
  id: string | null;
  product_id: string;
  product_name: string;
  retail_price: number;
  price_override: number | null;
  discount_percent: number | null;
  effective_price: number | null;
  notes: string | null;
  updated_at: string | null;
}

// GET /api/admin/distributor-pricing?tenant_id=xxx
// Returns ALL products with their distributor pricing (if any) for a tenant.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('distributors.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenant_id');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  const rows = await query<DistributorPricingRow>(
    `SELECT
       dp.id,
       p.id AS product_id,
       p.name AS product_name,
       p.price::float AS retail_price,
       dp.price_override::float,
       dp.discount_percent::float,
       CASE
         WHEN dp.price_override IS NOT NULL THEN dp.price_override::float
         WHEN dp.discount_percent IS NOT NULL THEN ROUND(p.price * (1 - dp.discount_percent / 100.0), 2)::float
         ELSE NULL
       END AS effective_price,
       dp.notes,
       dp.updated_at
     FROM products p
     LEFT JOIN distributor_pricing dp ON dp.product_id = p.id AND dp.tenant_id = $1
     WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
     ORDER BY p.name ASC`,
    [tenantId]
  );

  return NextResponse.json(rows);
}

const upsertSchema = z.object({
  tenant_id: z.string().min(1),
  product_id: z.string().min(1),
  price_override: z.number().min(0).nullable().optional(),
  discount_percent: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine(
  (d) => d.price_override != null || d.discount_percent != null,
  { message: 'Either price_override or discount_percent must be provided' }
);

// POST /api/admin/distributor-pricing — create or update (upsert)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('distributors.manage');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  const body = await request.json();
  const result = upsertSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
  }

  const { tenant_id, product_id, price_override, discount_percent, notes } = result.data;

  try {
    const [row] = await query<{ id: string }>(
      `INSERT INTO distributor_pricing (tenant_id, product_id, price_override, discount_percent, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, product_id) DO UPDATE SET
         price_override = EXCLUDED.price_override,
         discount_percent = EXCLUDED.discount_percent,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING id`,
      [tenant_id, product_id, price_override ?? null, discount_percent ?? null, notes ?? null]
    );

    securityLogger.logAdminAction(
      auth.session.user.id,
      auth.session.user.name,
      'upsert_distributor_pricing',
      row.id,
      ip,
      { tenant_id, product_id, price_override, discount_percent }
    );

    return NextResponse.json({ success: true, id: row.id });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
