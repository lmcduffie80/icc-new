import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: 'Confirmation required. Send { confirm: true } to permanently delete.' },
        { status: 400 }
      );
    }

    const product = await queryOne<{
      id: string;
      name: string;
      sku: string;
      category: string | null;
      price: number;
      supplier_id: string | null;
    }>(
      `SELECT id, name, sku, category, price, supplier_id
       FROM products WHERE id = $1`,
      [id]
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Delete inventory transactions first if the table exists (FK is ON DELETE RESTRICT)
    try {
      await query(
        `DELETE FROM inventory_transactions WHERE product_id = $1`,
        [id]
      );
    } catch {
      // Table may not exist yet in all environments — safe to skip
    }

    // Delete the product (cascades to product_warehouses, approval history, margin history, etc.)
    await queryOne('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'product',
      resourceId: id,
      before: product as unknown as Record<string, unknown>,
      after: { hard_deleted: true, deleted_by: auth.session.adminUser.id },
    });

    return NextResponse.json({
      success: true,
      message: `Product "${product.name}" (${product.sku}) permanently deleted.`,
    });
  } catch (error) {
    console.error('Error hard-deleting product:', error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
