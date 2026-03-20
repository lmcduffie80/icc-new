import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
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

// GET /api/admin/warehouses - List all warehouses
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('products.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active_only') === 'true';

  let sql = 'SELECT * FROM warehouses WHERE 1=1';
  const params: unknown[] = [];

  if (activeOnly) {
    sql += ' AND is_active = true';
  }

  sql += ' ORDER BY name';

  const warehouses = await query<Warehouse>(sql, params);
  return NextResponse.json(warehouses);
}

// POST /api/admin/warehouses - Create a new warehouse
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('products.create');
  if (auth.error) return auth.error;

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
      is_active = true,
    } = body;

    if (!name || !address_street || !address_city || !address_state || !address_zip) {
      return NextResponse.json(
        { error: 'Name and complete address are required' },
        { status: 400 }
      );
    }

    const warehouse = await queryOne<Warehouse>(
      `INSERT INTO warehouses (
        name, address_street, address_city, address_state, address_zip, phone, email, is_active
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        address_street,
        address_city,
        address_state,
        address_zip,
        phone || null,
        email || null,
        is_active ?? true,
      ]
    );

    if (!warehouse) {
      return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
    }

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'warehouse',
      resourceId: warehouse.id,
      after: warehouse as unknown as Record<string, unknown>,
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    console.error('Error creating warehouse:', error);
    return NextResponse.json(
      { error: 'Failed to create warehouse' },
      { status: 500 }
    );
  }
}

