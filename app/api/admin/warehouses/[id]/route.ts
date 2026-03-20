import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

interface Warehouse {
  id: string;
  name: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// GET /api/admin/warehouses/[id] - Get a single warehouse
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  const warehouse = await queryOne<Warehouse>(
    'SELECT * FROM warehouses WHERE id = $1',
    [id]
  );

  if (!warehouse) {
    return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
  }

  return NextResponse.json(warehouse);
}

// PUT /api/admin/warehouses/[id] - Update a warehouse
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const existingWarehouse = await queryOne<Warehouse>(
      'SELECT * FROM warehouses WHERE id = $1',
      [id]
    );

    if (!existingWarehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      address_street,
      address_city,
      address_state,
      address_zip,
      phone,
      email,
      is_active,
    } = body;

    const warehouse = await queryOne<Warehouse>(
      `UPDATE warehouses
       SET name = COALESCE($2, name),
           address_street = COALESCE($3, address_street),
           address_city = COALESCE($4, address_city),
           address_state = COALESCE($5, address_state),
           address_zip = COALESCE($6, address_zip),
           phone = $7,
           email = $8,
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name,
        address_street,
        address_city,
        address_state,
        address_zip,
        phone !== undefined ? phone : existingWarehouse.phone,
        email !== undefined ? email : existingWarehouse.email,
        is_active,
      ]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'warehouse',
      resourceId: id,
      before: existingWarehouse as unknown as Record<string, unknown>,
      after: warehouse as unknown as Record<string, unknown>,
    });

    return NextResponse.json(warehouse);
  } catch (error) {
    console.error('Error updating warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to update warehouse' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/warehouses/[id] - Delete a warehouse
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const existingWarehouse = await queryOne<Warehouse>(
      'SELECT * FROM warehouses WHERE id = $1',
      [id]
    );

    if (!existingWarehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    // Check if warehouse is used in any orders (protect historical data)
    const ordersUsingWarehouse = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM orders WHERE warehouse_id = $1',
      [id]
    );

    if (ordersUsingWarehouse && ordersUsingWarehouse.count > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete warehouse. It is referenced by ${ordersUsingWarehouse.count} order(s). Historical order data must be preserved. Please deactivate the warehouse instead.` 
        },
        { status: 400 }
      );
    }

    // Note: Product inventory (product_warehouses) and supplier assignments (supplier_warehouses)
    // will be automatically removed by CASCADE delete constraints in the database.

    await queryOne('DELETE FROM warehouses WHERE id = $1', [id]);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'warehouse',
      resourceId: id,
      before: existingWarehouse as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to delete warehouse' },
      { status: 500 }
    );
  }
}

