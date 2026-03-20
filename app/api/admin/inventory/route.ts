import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  supplier_id: string | null;
  supplier_id_number: string;
  supplier_name: string;
  supplier_company: string;
  supplier_number: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_address: string;
  inventory_count: number;
  warehouse_location: string | null;
  updated_at: string;
}

// GET /api/admin/inventory - Get all inventory with supplier and warehouse info
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);

  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  try {
    const inventory = await query<InventoryItem>(
      `SELECT 
        pw.id,
        pw.product_id,
        p.name as product_name,
        p.sku as product_sku,
        pw.warehouse_id,
        w.name as warehouse_name,
        CONCAT(w.address_street, ', ', w.address_city, ', ', w.address_state, ' ', w.address_zip) as warehouse_address,
        pw.inventory_count,
        pw.warehouse_location,
        pw.updated_at,
        su.id as supplier_id,
        CASE 
          WHEN su.id IS NOT NULL THEN LPAD((ABS(HASHTEXT(su.id) % 900000) + 100000)::TEXT, 6, '0')
          ELSE '000000'
        END as supplier_id_number,
        COALESCE(su.name, 'Innovative Crop Care') as supplier_name,
        COALESCE(su.company_name, 'Innovative Crop Care, LLC') as supplier_company,
        su.supplier_number
      FROM product_warehouses pw
      INNER JOIN products p ON p.id = pw.product_id
      INNER JOIN warehouses w ON w.id = pw.warehouse_id
      LEFT JOIN supplier_users su ON su.id = p.supplier_id
      WHERE p.deleted_at IS NULL
      ORDER BY 
        COALESCE(su.company_name, 'Innovative Crop Care, LLC'),
        p.name,
        w.name`
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/inventory',
      method: 'GET',
      details: {
        action: 'view_inventory',
        count: inventory.length,
      },
      severity: 'low',
    });

    return NextResponse.json({ inventory });
  } catch (error) {
    securityLogger.logError('Failed to fetch inventory', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

