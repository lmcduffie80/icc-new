import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

// GET /api/admin/acre-pack/passes/[passId]/products
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { passId } = await params;

  if (isNaN(Number(passId))) {
    return NextResponse.json({ error: 'Invalid passId' }, { status: 400 });
  }

  try {
    const products = await query<{
      id: number;
      product_id: string;
      product_name: string;
      price: string;
      unit_of_measure: string | null;
      is_recommended: boolean;
      default_rate_per_acre: string;
      min_rate: string;
      max_rate: string;
      rate_unit: string;
      unit_size: string;
      unit_size_unit: string | null;
      lbs_per_gallon: string | null;
      label_scenarios: Array<{ label: string; rate: number }> | null;
      sort_order: number;
    }>(
      `SELECT
         app.id, app.product_id, p.name AS product_name, p.price, p.unit_of_measure,
         app.is_recommended, app.default_rate_per_acre, app.min_rate, app.max_rate,
         app.rate_unit, app.unit_size, app.unit_size_unit, app.lbs_per_gallon,
         app.label_scenarios, app.sort_order
       FROM acre_pack_pass_products app
       JOIN products p ON p.id = app.product_id
       WHERE app.pass_id = $1
       ORDER BY app.sort_order`,
      [Number(passId)]
    );

    return NextResponse.json({ products });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass products GET failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const addProductSchema = z.object({
  product_id: z.string().min(1),
  is_recommended: z.boolean().optional().default(false),
  default_rate_per_acre: z.number().positive(),
  min_rate: z.number().positive(),
  max_rate: z.number().positive(),
  rate_unit: z.string().min(1).max(30),
  unit_size: z.number().positive(),
  unit_size_unit: z.string().min(1).max(20).nullable().optional().default(null),
  lbs_per_gallon: z.number().positive().nullable().optional().default(null),
  label_scenarios: z.array(z.object({ label: z.string().min(1), rate: z.number() })).nullable().optional().default(null),
  sort_order: z.number().int().optional().default(0),
});

// POST /api/admin/acre-pack/passes/[passId]/products — add product to pass
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.manage_products')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { passId } = await params;

  if (isNaN(Number(passId))) {
    return NextResponse.json({ error: 'Invalid passId' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = addProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { product_id, is_recommended, default_rate_per_acre, min_rate, max_rate, rate_unit, unit_size, unit_size_unit, lbs_per_gallon, label_scenarios, sort_order } = parsed.data;

  try {
    const record = await queryOne<{ id: number }>(
      `INSERT INTO acre_pack_pass_products
         (pass_id, product_id, is_recommended, default_rate_per_acre, min_rate, max_rate, rate_unit, unit_size, unit_size_unit, lbs_per_gallon, label_scenarios, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (pass_id, product_id) DO UPDATE SET
         is_recommended = EXCLUDED.is_recommended,
         default_rate_per_acre = EXCLUDED.default_rate_per_acre,
         min_rate = EXCLUDED.min_rate,
         max_rate = EXCLUDED.max_rate,
         rate_unit = EXCLUDED.rate_unit,
         unit_size = EXCLUDED.unit_size,
         unit_size_unit = EXCLUDED.unit_size_unit,
         lbs_per_gallon = EXCLUDED.lbs_per_gallon,
         label_scenarios = EXCLUDED.label_scenarios,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()
       RETURNING id`,
      [Number(passId), product_id, is_recommended, default_rate_per_acre, min_rate, max_rate, rate_unit, unit_size, unit_size_unit, lbs_per_gallon, label_scenarios ? JSON.stringify(label_scenarios) : null, sort_order]
    );

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_product_assigned',
      `pass:${passId}`,
      ip,
      { productId: product_id }
    );

    return NextResponse.json({ success: true, id: record?.id }, { status: 201 });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass product POST failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/acre-pack/passes/[passId]/products?productId=X
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ passId: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;
  if (!session.permissions.includes('acrepack.manage_products')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { passId } = await params;
  const productId = request.nextUrl.searchParams.get('productId');

  if (isNaN(Number(passId)) || !productId) {
    return NextResponse.json({ error: 'passId and productId are required' }, { status: 400 });
  }

  try {
    await queryOne(
      `DELETE FROM acre_pack_pass_products WHERE pass_id = $1 AND product_id = $2 RETURNING id`,
      [Number(passId), productId]
    );

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_product_removed',
      `pass:${passId}`,
      ip,
      { productId }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Admin AcrePack pass product DELETE failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
