import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface Order {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: object;
  billing_address: object;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

// GET /api/admin/orders - List all orders
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const userId = searchParams.get('user_id');
  const search = searchParams.get('search');

  let sql = `
    SELECT o.*, u.email as user_email, u.name as user_name
    FROM orders o
    JOIN "user" u ON u.id = o.user_id
    WHERE o.status != 'cancelled'
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    // If status filter is explicitly set to 'cancelled', allow it
    // Otherwise, cancelled orders are excluded by default
    if (status === 'cancelled') {
      sql = `
        SELECT o.*, u.email as user_email, u.name as user_name
        FROM orders o
        JOIN "user" u ON u.id = o.user_id
        WHERE o.status = $${paramIndex}
      `;
      params.push(status);
      paramIndex++;
    } else {
      sql += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }
  }

  if (userId) {
    sql += ` AND o.user_id = $${paramIndex++}`;
    params.push(userId);
  }

  if (search) {
    sql += ` AND (o.order_number ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY o.created_at DESC`;

  const orders = await query<Order>(sql, params);
  return NextResponse.json(orders);
}

