import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface ProductForPO {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  supplier_price: string | null;
  icc_margin_percent: number | null;
  customer_margin_percent: number | null;
  unit_of_measure: string | null;
  category: string;
}

// GET /api/admin/purchase-orders/products - Get products for PO line items
// Optional query param: supplier_id - filter by supplier
// If no supplier_id, returns all products (for vendors)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('products.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplier_id');

  try {
    let sql = `
      SELECT id, name, sku, price, supplier_price, icc_margin_percent, customer_margin_percent, unit_of_measure, category
      FROM products
      WHERE approval_status = 'published'
    `;
    const params: unknown[] = [];

    if (supplierId) {
      sql += ` AND supplier_id = $1`;
      params.push(supplierId);
    }

    sql += ` ORDER BY name ASC`;

    const products = await query<ProductForPO>(sql, params);

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching products for PO:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
