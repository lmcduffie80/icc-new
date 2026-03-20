import { type NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ProductRow {
  pass_id: number;
  pass_name: string;
  category: string;
  timing_label: string | null;
  product_name: string | null;
  rate_per_acre: string | null;
  rate_unit: string | null;
  units_needed: string | null;
  unit_cost: string | null;
  line_total: string | null;
  is_recommended: boolean | null;
}

export interface PlanProduct {
  product_name: string;
  rate_per_acre: string | null;
  rate_unit: string | null;
  units_needed: string | null;
  unit_cost: string | null;
  line_total: string | null;
  is_recommended: boolean;
}

export interface PassWithProducts {
  pass_id: number;
  pass_name: string;
  category: string;
  timing_label: string | null;
  products: PlanProduct[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  if (!authResult.session?.permissions.includes('acrepack.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { planId } = await params;
  const planIdNum = parseInt(planId, 10);
  if (isNaN(planIdNum)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }

  try {
    const rows = await query<ProductRow>(
      `SELECT
         pp.id          AS pass_id,
         pp.name        AS pass_name,
         pp.category,
         pp.timing_label,
         fpp.product_name,
         fpp.rate_per_acre,
         fpp.rate_unit,
         fpp.units_needed,
         fpp.unit_cost,
         fpp.line_total,
         fpp.is_recommended
       FROM farmer_plan_passes pp
       LEFT JOIN farmer_plan_products fpp ON fpp.plan_pass_id = pp.id
       WHERE pp.plan_id = $1
       ORDER BY pp.sort_order, fpp.sort_order`,
      [planIdNum]
    );

    // Group flat rows into passes with nested products
    const passMap = new Map<number, PassWithProducts>();
    for (const row of rows) {
      if (!passMap.has(row.pass_id)) {
        passMap.set(row.pass_id, {
          pass_id: row.pass_id,
          pass_name: row.pass_name,
          category: row.category,
          timing_label: row.timing_label,
          products: [],
        });
      }
      if (row.product_name) {
        passMap.get(row.pass_id)!.products.push({
          product_name: row.product_name,
          rate_per_acre: row.rate_per_acre,
          rate_unit: row.rate_unit,
          units_needed: row.units_needed,
          unit_cost: row.unit_cost,
          line_total: row.line_total,
          is_recommended: row.is_recommended ?? false,
        });
      }
    }

    return NextResponse.json({ passes: Array.from(passMap.values()) });
  } catch (error) {
    console.error('Failed to fetch plan products', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
