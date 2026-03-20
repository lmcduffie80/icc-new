import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { OrdersTable } from './orders-table';

export const dynamic = 'force-dynamic';

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
  user_email: string;
  user_name: string;
}

async function getOrders(): Promise<Order[]> {
  try {
    return await query<Order>(
      `SELECT o.*, u.email as user_email, u.name as user_name
       FROM orders o
       JOIN "user" u ON u.id = o.user_id
       ORDER BY 
         CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END,
         o.created_at DESC`
    );
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    return [];
  }
}

export default async function OrdersPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('orders.view')) {
    redirect('/admin');
  }

  const orders = await getOrders();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="mt-1 text-slate-500">Manage customer orders</p>
      </div>

      <OrdersTable orders={orders} permissions={session.permissions} />
    </div>
  );
}

