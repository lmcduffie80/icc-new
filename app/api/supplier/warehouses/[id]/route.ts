import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/supplier/warehouses/[id] - Get a single warehouse for the supplier
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;
  const { id } = await params;

  try {
    const warehouse = await queryOne<{
      id: string;
      name: string;
      address_street: string;
      address_city: string;
      address_state: string;
      address_zip: string;
      phone: string | null;
      email: string | null;
      is_active: boolean;
      is_primary: boolean;
    }>(
      `SELECT 
        w.id, w.name, w.address_street, w.address_city, 
        w.address_state, w.address_zip, w.phone, w.email, w.is_active,
        sw.is_primary
      FROM warehouses w
      JOIN supplier_warehouses sw ON sw.warehouse_id = w.id
      WHERE w.id = $1 AND sw.supplier_id = $2`,
      [id, supplierId]
    );

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    return NextResponse.json({ warehouse });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier warehouse', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/supplier/warehouses/[id] - Update a warehouse
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;
  const { id } = await params;
  const ip = getClientIp(request);

  try {
    // Verify the warehouse belongs to this supplier
    const existingLink = await queryOne<{ warehouse_id: string; is_primary: boolean }>(
      'SELECT warehouse_id, is_primary FROM supplier_warehouses WHERE warehouse_id = $1 AND supplier_id = $2',
      [id, supplierId]
    );

    if (!existingLink) {
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
      is_primary = false,
    } = body;

    if (!name || !address_street || !address_city || !address_state || !address_zip) {
      return NextResponse.json(
        { error: 'Name and complete address are required' },
        { status: 400 }
      );
    }

    // If this is set as primary, unset other primary warehouses for this supplier
    if (is_primary && !existingLink.is_primary) {
      await query(
        `UPDATE supplier_warehouses 
         SET is_primary = false 
         WHERE supplier_id = $1 AND warehouse_id != $2`,
        [supplierId, id]
      );
    }

    // Update warehouse
    const warehouse = await queryOne<{
      id: string;
      name: string;
      address_street: string;
      address_city: string;
      address_state: string;
      address_zip: string;
      phone: string | null;
      email: string | null;
      is_active: boolean;
    }>(
      `UPDATE warehouses
       SET name = $3,
           address_street = $4,
           address_city = $5,
           address_state = $6,
           address_zip = $7,
           phone = $8,
           email = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        supplierId,
        name.trim(),
        address_street,
        address_city,
        address_state,
        address_zip,
        phone || null,
        email || null,
      ]
    );

    if (!warehouse) {
      return NextResponse.json({ error: 'Failed to update warehouse' }, { status: 500 });
    }

    // Update supplier_warehouses relationship
    await query(
      `UPDATE supplier_warehouses 
       SET is_primary = $3 
       WHERE warehouse_id = $1 AND supplier_id = $2`,
      [id, supplierId, is_primary]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/warehouses/${id}`,
      method: 'PUT',
      details: {
        action: 'warehouse_updated',
        supplier_id: supplierId,
        warehouse_id: id,
        warehouse_name: warehouse.name,
      },
      severity: 'low',
    });

    return NextResponse.json({ warehouse: { ...warehouse, is_primary } });
  } catch (error) {
    securityLogger.logError('Failed to update supplier warehouse', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/supplier/warehouses/[id] - Delete a warehouse (removes supplier link)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;
  const { id } = await params;
  const ip = getClientIp(request);

  try {
    // Verify the warehouse belongs to this supplier
    const existingLink = await queryOne<{ warehouse_id: string; is_primary: boolean }>(
      'SELECT warehouse_id, is_primary FROM supplier_warehouses WHERE warehouse_id = $1 AND supplier_id = $2',
      [id, supplierId]
    );

    if (!existingLink) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    // Check if warehouse is used in any orders
    const ordersUsingWarehouse = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM orders WHERE warehouse_id = $1',
      [id]
    );

    // Check if warehouse has any product inventory
    const productInventory = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM product_warehouses WHERE warehouse_id = $1',
      [id]
    );

    const issues: string[] = [];
    if (ordersUsingWarehouse && ordersUsingWarehouse.count > 0) {
      issues.push(`${ordersUsingWarehouse.count} order(s)`);
    }
    if (productInventory && productInventory.count > 0) {
      issues.push(`${productInventory.count} product inventory record(s)`);
    }

    if (issues.length > 0) {
      return NextResponse.json(
        { 
          error: `Cannot remove warehouse. It is currently used in: ${issues.join(', ')}. Please contact an administrator.` 
        },
        { status: 400 }
      );
    }

    // Remove the supplier-warehouse link
    await query(
      'DELETE FROM supplier_warehouses WHERE warehouse_id = $1 AND supplier_id = $2',
      [id, supplierId]
    );

    // Check if any other suppliers are using this warehouse
    const otherSuppliers = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM supplier_warehouses WHERE warehouse_id = $1',
      [id]
    );

    // If no other suppliers use it, delete the warehouse itself
    if (!otherSuppliers || otherSuppliers.count === 0) {
      await query('DELETE FROM warehouses WHERE id = $1', [id]);
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/warehouses/${id}`,
      method: 'DELETE',
      details: {
        action: 'warehouse_removed',
        supplier_id: supplierId,
        warehouse_id: id,
      },
      severity: 'low',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to delete supplier warehouse', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

