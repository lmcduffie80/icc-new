import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { ShoppingCart } from 'lucide-react';
import { OrdersTable } from './orders-table';

export const dynamic = 'force-dynamic';

async function getOrders(supplierId: string) {
  try {
    return await query<{
      order_id: string;
      order_number: string;
      order_status: string;
      order_date: string;
      customer_name: string;
      product_name: string;
      product_id: string;
      quantity: number;
      price: string;
      unit_of_measure: string | null;
      image: string | null;
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
        oi.unit_of_measure,
        oi.image,
        (oi.price * oi.quantity)::text as total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE p.supplier_id = $1
        AND p.deleted_at IS NULL
      ORDER BY 
        CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END,
        o.created_at DESC`,
      [supplierId]
    );
  } catch (error) {
    console.error('Error fetching supplier orders:', error);
    return [];
  }
}

export default async function SupplierOrdersPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const orders = await getOrders(session.user.id);

  // Group orders by order_id
  const orderMap = new Map<string, typeof orders>();
  orders.forEach((item) => {
    if (!orderMap.has(item.order_id)) {
      orderMap.set(item.order_id, []);
    }
    orderMap.get(item.order_id)!.push(item);
  });

  const groupedOrders = Array.from(orderMap.entries()).map(([orderId, items]) => {
    const firstItem = items[0];
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.total), 0);
    
    return {
      order_id: orderId,
      order_number: firstItem.order_number,
      order_status: firstItem.order_status,
      order_date: firstItem.order_date,
      customer_name: firstItem.customer_name,
      items,
      total_amount: totalAmount,
    };
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="mt-1 text-slate-500">View orders for your products</p>
      </div>

      {groupedOrders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No orders yet</h3>
          <p className="mt-2 text-sm text-slate-500">
            Orders for your products will appear here once customers make purchases.
          </p>
        </div>
      ) : (
        <OrdersTable orders={groupedOrders} />
      )}
    </div>
  );
}

