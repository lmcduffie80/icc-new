import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';

interface Order {
  id: string;
  warehouse_id: string | null;
}

interface WarehouseAllocation {
  warehouse_id: string;
  warehouse_name: string;
  items?: Array<{ product_id: string; quantity: number }>;
}

interface OrderMetadata {
  warehouse_allocations?: WarehouseAllocation[];
  [key: string]: unknown;
}

// PUT /api/admin/orders/[id]/warehouse - Update warehouse for order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.update_status');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { warehouse_id, action } = body;

    // Get existing order with metadata
    const existingOrder = await queryOne<Order & { metadata: Record<string, unknown> | string }>(
      'SELECT id, warehouse_id, metadata FROM orders WHERE id = $1',
      [id]
    );

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // If warehouse_id is provided, validate it exists
    if (warehouse_id) {
      const warehouse = await queryOne<{ id: string; name: string }>(
        'SELECT id, name FROM warehouses WHERE id = $1 AND is_active = true',
        [warehouse_id]
      );

      if (!warehouse) {
        return NextResponse.json(
          { error: 'Warehouse not found or inactive' },
          { status: 404 }
        );
      }

      // Parse existing metadata
      let metadata: OrderMetadata = {};
      if (typeof existingOrder.metadata === 'string') {
        try {
          metadata = JSON.parse(existingOrder.metadata) as OrderMetadata;
        } catch {
          metadata = {};
        }
      } else if (existingOrder.metadata) {
        metadata = existingOrder.metadata as OrderMetadata;
      }

      // Get or initialize warehouse_allocations array
      let warehouseAllocations: WarehouseAllocation[] = metadata.warehouse_allocations || [];

      if (action === 'add') {
        // Add warehouse to allocations if not already present
        const exists = warehouseAllocations.some(
          (alloc) => alloc.warehouse_id === warehouse_id
        );
        
        if (!exists) {
          warehouseAllocations.push({
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            items: [],
          });
        }
      } else if (action === 'remove') {
        // Remove warehouse from allocations
        warehouseAllocations = warehouseAllocations.filter(
          (alloc) => alloc.warehouse_id !== warehouse_id
        );
      } else {
        // Default behavior: set primary warehouse_id (backward compatibility)
        // Also add to allocations if not present
        const exists = warehouseAllocations.some(
          (alloc) => alloc.warehouse_id === warehouse_id
        );
        
        if (!exists) {
          warehouseAllocations.push({
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            items: [],
          });
        }

        // Update primary warehouse_id
        await queryOne<Order>(
          `UPDATE orders 
           SET warehouse_id = $2, updated_at = NOW() 
           WHERE id = $1 
           RETURNING *`,
          [id, warehouse_id || null]
        );
      }

      // Update metadata with allocations
      metadata.warehouse_allocations = warehouseAllocations;

      // Update order with new metadata
      await queryOne(
        `UPDATE orders 
         SET metadata = $2, updated_at = NOW() 
         WHERE id = $1 
         RETURNING *`,
        [id, JSON.stringify(metadata)]
      );

      return NextResponse.json({ 
        success: true, 
        warehouse_id: action !== 'remove' ? warehouse_id : null,
        warehouse_allocations: warehouseAllocations,
      });
    } else {
      // No warehouse_id provided - just update metadata if needed
      return NextResponse.json({ 
        success: true, 
        warehouse_id: existingOrder.warehouse_id 
      });
    }
  } catch (error) {
    console.error('Error updating order warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to update order warehouse' },
      { status: 500 }
    );
  }
}

