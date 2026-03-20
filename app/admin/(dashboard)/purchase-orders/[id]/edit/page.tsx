import { getAdminSession } from '@/lib/admin-auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { queryOne, query } from '@/lib/db';
import { EditPurchaseOrderForm } from './edit-purchase-order-form';
import { POEmailButton } from '../po-email-button';

async function getPurchaseOrder(id: number) {
  try {
    const po = await queryOne<{
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
      supplier_address_street: string | null;
      supplier_address_city: string | null;
      supplier_address_state: string | null;
      supplier_address_zip: string | null;
    }>(
      `SELECT po.id, po.po_number, po.vendor_id, po.supplier_id, po.order_date, po.buyer_id, po.buyer_name, po.buyer_user_id,
              po.payment_terms, po.ship_to_address_id, po.bill_to_address_id, po.currency, po.tax_rate,
              po.subtotal_amount, po.tax_amount, po.total_amount, po.status, po.notes, po.created_at, po.updated_at,
              v.name as vendor_name,
              su.company_name as supplier_name,
              su.address_street as supplier_address_street,
              su.address_city as supplier_address_city,
              su.address_state as supplier_address_state,
              su.address_zip as supplier_address_zip
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN supplier_users su ON su.id = po.supplier_id
       WHERE po.id = $1`,
      [id]
    );

    if (!po) {
      return null;
    }

    // Fetch line items
    const lineItems = await query<{
      id: number;
      purchase_order_id: number;
      line_number: number;
      item_number: string;
      description: string;
      need_by_date: string | null;
      quantity: number;
      uom: string;
      unit_price: number;
      taxable: boolean;
      line_total: number;
    }>(
      `SELECT id, purchase_order_id, line_number, item_number, description, need_by_date,
              quantity, uom, unit_price, taxable, line_total
       FROM purchase_order_lines
       WHERE purchase_order_id = $1
       ORDER BY line_number`,
      [id]
    );

    // Fetch addresses
    const shipToAddress = await queryOne<{
      id: number;
      type: string;
      company_name: string;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      zip_code: string;
      country: string;
    }>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.ship_to_address_id]
    );

    const billToAddress = await queryOne<{
      id: number;
      type: string;
      company_name: string;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      zip_code: string;
      country: string;
    }>(
      'SELECT id, type, company_name, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [po.bill_to_address_id]
    );

    if (!shipToAddress || !billToAddress) {
      return null;
    }

    return {
      ...po,
      lines: lineItems,
      ship_to_address: shipToAddress,
      bill_to_address: billToAddress,
    };
  } catch (error) {
    console.error('Failed to fetch purchase order:', error);
    return null;
  }
}

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
  }

  const { id } = await params;
  const poId = parseInt(id, 10);

  if (isNaN(poId)) {
    notFound();
  }

  const purchaseOrder = await getPurchaseOrder(poId);

  if (!purchaseOrder) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/purchase-orders"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Purchase Orders
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Purchase Order</h1>
            <p className="mt-1 text-slate-500">Update purchase order {purchaseOrder.po_number}</p>
          </div>
          <POEmailButton 
            poId={purchaseOrder.id.toString()} 
            poNumber={purchaseOrder.po_number}
            status={purchaseOrder.status}
          />
        </div>
      </div>

      <EditPurchaseOrderForm purchaseOrder={purchaseOrder} />
    </div>
  );
}

