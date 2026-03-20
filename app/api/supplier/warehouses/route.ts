import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/supplier/warehouses - Get warehouses for the supplier
export async function GET(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;

  try {
    const warehouses = await query<{
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
      WHERE sw.supplier_id = $1
      ORDER BY sw.is_primary DESC, w.name`,
      [supplierId]
    );

    return NextResponse.json({ warehouses });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier warehouses', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/supplier/warehouses - Create warehouse and link to supplier
export async function POST(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;
  const ip = getClientIp(request);

  try {
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

    // If this is set as primary, unset other primary warehouses
    if (is_primary) {
      await query(
        `UPDATE supplier_warehouses 
         SET is_primary = false 
         WHERE supplier_id = $1`,
        [supplierId]
      );
    }

    const warehouseName = name.trim();

    // Check if a warehouse with this name already exists
    let warehouse = await queryOne<{
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
      'SELECT * FROM warehouses WHERE name = $1',
      [warehouseName]
    );

    // If warehouse exists, check if supplier is already linked to it
    if (warehouse) {
      const existingLink = await queryOne<{ supplier_id: string }>(
        'SELECT supplier_id FROM supplier_warehouses WHERE warehouse_id = $1 AND supplier_id = $2',
        [warehouse.id, supplierId]
      );

      if (existingLink) {
        return NextResponse.json(
          { error: 'You are already linked to this warehouse' },
          { status: 400 }
        );
      }

      // Link supplier to existing warehouse
      await query(
        `INSERT INTO supplier_warehouses (supplier_id, warehouse_id, is_primary)
         VALUES ($1, $2, $3)`,
        [supplierId, warehouse.id, is_primary]
      );
    } else {
      // Create new warehouse if it doesn't exist
      warehouse = await queryOne<{
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
        `INSERT INTO warehouses (
          name, address_street, address_city, address_state, address_zip, phone, email, is_active
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING *`,
        [
          warehouseName,
          address_street,
          address_city,
          address_state,
          address_zip,
          phone || null,
          email || null,
        ]
      );

      if (!warehouse) {
        return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
      }

      // Link warehouse to supplier
      await query(
        `INSERT INTO supplier_warehouses (supplier_id, warehouse_id, is_primary)
         VALUES ($1, $2, $3)`,
        [supplierId, warehouse.id, is_primary]
      );
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/supplier/warehouses',
      method: 'POST',
      details: {
        action: 'warehouse_created',
        supplier_id: supplierId,
        warehouse_id: warehouse.id,
        warehouse_name: warehouse.name,
      },
      severity: 'low',
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    securityLogger.logError('Failed to create supplier warehouse', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

