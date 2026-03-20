import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';

interface OrderItemInventory {
  product_id: string;
  product_name: string;
  order_quantity: number;
  available_quantity: number;
}

// GET /api/admin/orders/[id]/warehouse/inventory - Get inventory availability for order items at a warehouse
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { id: orderId } = await params;
  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id');

  if (!warehouseId) {
    return NextResponse.json(
      { error: 'Warehouse ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get all order items for this order
    const orderItems = await query<{
      product_id: string;
      quantity: number;
      name: string;
    }>(
      `SELECT product_id, quantity, name
       FROM order_items
       WHERE order_id = $1`,
      [orderId]
    );

    if (orderItems.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // For each order item, check inventory at the selected warehouse
    const inventoryItems: OrderItemInventory[] = [];

    for (const item of orderItems) {
      try {
        // Check inventory at the specific warehouse
        const warehouseInventory = await queryOne<{ inventory_count: number }>(
          `SELECT inventory_count
           FROM product_warehouses
           WHERE product_id = $1 AND warehouse_id = $2`,
          [item.product_id, warehouseId]
        );

        inventoryItems.push({
          product_id: item.product_id,
          product_name: item.name,
          order_quantity: item.quantity,
          available_quantity: warehouseInventory?.inventory_count || 0,
        });
      } catch (error) {
        // If individual product query fails, return 0 inventory
        console.error(`Error fetching inventory for product ${item.product_id}:`, error);
        inventoryItems.push({
          product_id: item.product_id,
          product_name: item.name,
          order_quantity: item.quantity,
          available_quantity: 0,
        });
      }
    }

    return NextResponse.json({ items: inventoryItems });
  } catch (error) {
    console.error('Error fetching warehouse inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warehouse inventory', items: [] },
      { status: 200 } // Return 200 with empty array to prevent UI disruption
    );
  }
}
