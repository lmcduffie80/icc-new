import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne, pool } from '@/lib/db';

interface ProductWarehouse {
  id: string;
  product_id: string;
  warehouse_id: string;
  inventory_count: number;
  warehouse_location: string | null;
  warehouse_name?: string;
  warehouse_address?: string;
}

/**
 * Sync product inventory_count with the sum of all warehouse inventories
 */
export async function syncProductInventoryCount(productId: string): Promise<void> {
  // Calculate sum of all warehouse inventories for this product
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(inventory_count), 0) as total
     FROM product_warehouses
     WHERE product_id = $1`,
    [productId]
  );

  const totalWarehouseInventory = parseInt(result.rows[0]?.total || '0', 10);

  // Update the main product inventory_count and icc_available_quantity
  await pool.query(
    `UPDATE products
     SET inventory_count = $1,
         icc_available_quantity = $1,
         in_stock = $1 > 0,
         updated_at = NOW()
     WHERE id = $2`,
    [totalWarehouseInventory, productId]
  );
}

// GET /api/admin/products/[id]/warehouses - Get all warehouses for a product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.view');
  if (auth.error) return auth.error;

  const { id: productId } = await params;

  try {
    const productWarehouses = await query<ProductWarehouse>(
      `SELECT 
        pw.id,
        pw.product_id,
        pw.warehouse_id,
        pw.inventory_count,
        pw.warehouse_location,
        w.name as warehouse_name,
        CONCAT(w.address_street, ', ', w.address_city, ', ', w.address_state, ' ', w.address_zip) as warehouse_address
       FROM product_warehouses pw
       JOIN warehouses w ON w.id = pw.warehouse_id
       WHERE pw.product_id = $1
       ORDER BY w.name`,
      [productId]
    );

    return NextResponse.json({ warehouses: productWarehouses });
  } catch (error) {
    console.error('Error fetching product warehouses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product warehouses' },
      { status: 500 }
    );
  }
}

// POST /api/admin/products/[id]/warehouses - Add or update warehouse inventory for a product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.update');
  if (auth.error) return auth.error;

  const { id: productId } = await params;

  try {
    const body = await request.json();
    const { warehouse_id, inventory_count, warehouse_location } = body;

    if (!warehouse_id) {
      return NextResponse.json(
        { error: 'Warehouse ID is required' },
        { status: 400 }
      );
    }

    // Upsert product warehouse inventory
    const productWarehouse = await queryOne<ProductWarehouse>(
      `INSERT INTO product_warehouses (product_id, warehouse_id, inventory_count, warehouse_location)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, warehouse_id)
       DO UPDATE SET
         inventory_count = EXCLUDED.inventory_count,
         warehouse_location = EXCLUDED.warehouse_location,
         updated_at = NOW()
       RETURNING *`,
      [
        productId,
        warehouse_id,
        inventory_count ?? 0,
        warehouse_location || null,
      ]
    );

    // Sync main product inventory_count with sum of warehouse inventories
    await syncProductInventoryCount(productId);

    return NextResponse.json(productWarehouse);
  } catch (error) {
    console.error('Error updating product warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to update product warehouse' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/products/[id]/warehouses - Remove warehouse inventory for a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.update');
  if (auth.error) return auth.error;

  const { id: productId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');

    if (!warehouseId) {
      return NextResponse.json(
        { error: 'Warehouse ID is required' },
        { status: 400 }
      );
    }

    await queryOne(
      'DELETE FROM product_warehouses WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId]
    );

    // Sync main product inventory_count with sum of warehouse inventories
    await syncProductInventoryCount(productId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to delete product warehouse' },
      { status: 500 }
    );
  }
}

