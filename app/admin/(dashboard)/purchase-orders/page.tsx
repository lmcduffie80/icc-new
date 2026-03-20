import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PurchaseOrdersTable } from './purchase-orders-table';
import { query } from '@/lib/db';

async function getPurchaseOrders() {
  try {
    const purchaseOrders = await query<{
      id: number;
      po_number: string;
      vendor_id: number | null;
      supplier_id: string | null;
      order_date: string;
      buyer_id: number | null;
      buyer_name: string;
      buyer_user_id: string | null;
      payment_terms: string;
      ship_to_address_id: number;
      bill_to_address_id: number;
      currency: string;
      tax_rate: number;
      subtotal_amount: number;
      tax_amount: number;
      total_amount: number;
      status: string;
      notes: string | null;
      created_at: string;
      updated_at: string;
      vendor_name: string | null;
      supplier_name: string | null;
    }>(
      `SELECT po.id, po.po_number, po.vendor_id, po.supplier_id, po.order_date, po.buyer_id, po.buyer_name, po.buyer_user_id,
              po.payment_terms, po.ship_to_address_id, po.bill_to_address_id, po.currency, po.tax_rate,
              po.subtotal_amount, po.tax_amount, po.total_amount, po.status, po.notes, po.created_at, po.updated_at,
              v.name as vendor_name,
              su.company_name as supplier_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN supplier_users su ON su.id = po.supplier_id
       ORDER BY po.created_at DESC`
    );

    return purchaseOrders;
  } catch (error) {
    console.error('Failed to fetch purchase orders:', error);
    return [];
  }
}

export default async function PurchaseOrdersPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const purchaseOrders = await getPurchaseOrders();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="mt-1 text-slate-500">Create and manage purchase orders from suppliers</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/purchase-orders/approvals"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Pending Approvals
          </Link>
          <Link
            href="/admin/purchase-orders/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Create Purchase Order
          </Link>
        </div>
      </div>

      <PurchaseOrdersTable purchaseOrders={purchaseOrders} />
    </div>
  );
}


