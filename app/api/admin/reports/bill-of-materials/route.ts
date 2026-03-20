import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface BOMProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number;
  inventory_count: number;
  in_stock: boolean;
  unit_of_measure: string | null;
  supplier_name: string | null;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  if (!auth.session.permissions.includes('reports.view_transactions')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  try {
    const products = await query<BOMProduct>(
      `SELECT
         p.id,
         p.sku,
         p.name,
         p.category,
         p.price,
         COALESCE(p.inventory_count, 0) AS inventory_count,
         COALESCE(p.in_stock, false) AS in_stock,
         p.unit_of_measure,
         s.company_name AS supplier_name
       FROM products p
       LEFT JOIN supplier_users s ON p.supplier_id = s.id
       WHERE p.deleted_at IS NULL
       ORDER BY p.sku ASC`
    );

    return NextResponse.json({ products });
  } catch (error) {
    console.error('BOM report error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill of materials' },
      { status: 500 }
    );
  }
}
