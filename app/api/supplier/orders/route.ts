import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/supplier/orders - Get all orders for the supplier's products
export async function GET(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;

  try {
    const orders = await query<{
      order_id: string;
      order_number: string;
      order_status: string;
      order_date: string;
      customer_name: string;
      product_name: string;
      product_id: string;
      quantity: number;
      price: string;
      total: string;
    }>(
      `SELECT 
        o.id as order_id,
        o.order_number,
        o.status as order_status,
        o.created_at as order_date,
        'Innovative CropCare' as customer_name,
        oi.name as product_name,
        oi.product_id,
        oi.quantity,
        oi.price,
        (oi.price * oi.quantity)::text as total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE p.supplier_id = $1
        AND p.deleted_at IS NULL
      ORDER BY o.created_at DESC`,
      [supplierId]
    );

    return NextResponse.json({ orders });
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier orders', error, getClientIp(request));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

