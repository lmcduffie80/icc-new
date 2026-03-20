import { type NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ProductRow {
  farmer_name: string;
  farmer_email: string;
  plan_name: string;
  crop: string;
  plan_year: number;
  total_acres: string;
  pass_name: string;
  category: string;
  timing_label: string | null;
  product_name: string;
  rate_per_acre: string;
  rate_unit: string;
  units_needed: string | null;
  unit_cost: string | null;
  line_total: string | null;
  cost_per_acre: string | null;
  is_recommended: boolean;
}

function escapeCell(value: string | number | boolean | null | undefined): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  if (!authResult.session?.permissions.includes('acrepack.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rows = await query<ProductRow>(
      `SELECT
         u.name        AS farmer_name,
         u.email       AS farmer_email,
         p.plan_name,
         p.crop,
         p.plan_year,
         p.total_acres,
         pp.name       AS pass_name,
         pp.category,
         pp.timing_label,
         fpp.product_name,
         fpp.rate_per_acre,
         fpp.rate_unit,
         fpp.units_needed,
         fpp.unit_cost,
         fpp.line_total,
         fpp.cost_per_acre,
         fpp.is_recommended
       FROM farmer_plan_products fpp
       JOIN farmer_plan_passes pp ON pp.id = fpp.plan_pass_id
       JOIN farmer_crop_plans p   ON p.id  = pp.plan_id
       JOIN "user" u              ON u.id  = p.user_id
       ORDER BY p.plan_year DESC, p.created_at DESC, pp.sort_order, fpp.sort_order`
    );

    const headers = [
      'Farmer Name',
      'Farmer Email',
      'Plan Name',
      'Crop',
      'Plan Year',
      'Total Acres',
      'Pass Name',
      'Pass Category',
      'Timing',
      'Product Name',
      'Rate/Acre',
      'Rate Unit',
      'Units Needed',
      'Unit Cost',
      'Line Total',
      'Cost/Acre',
      'Recommended',
    ];

    const csvRows = rows.map((r) => [
      escapeCell(r.farmer_name),
      escapeCell(r.farmer_email),
      escapeCell(r.plan_name),
      escapeCell(r.crop),
      escapeCell(r.plan_year),
      escapeCell(r.total_acres),
      escapeCell(r.pass_name),
      escapeCell(r.category),
      escapeCell(r.timing_label),
      escapeCell(r.product_name),
      escapeCell(r.rate_per_acre),
      escapeCell(r.rate_unit),
      escapeCell(r.units_needed),
      escapeCell(r.unit_cost),
      escapeCell(r.line_total),
      escapeCell(r.cost_per_acre),
      escapeCell(r.is_recommended ? 'Yes' : 'No'),
    ].join(','));

    const csv = [headers.map(escapeCell).join(','), ...csvRows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="crop-plan-products-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export forecast products', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
