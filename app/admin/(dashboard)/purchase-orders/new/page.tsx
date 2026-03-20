import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PurchaseOrderForm } from './purchase-order-form';

export default async function NewPurchaseOrderPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.view')) {
    redirect('/admin');
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create Purchase Order</h1>
          <p className="mt-1 text-slate-500">Create a new purchase order to order products from vendors</p>
        </div>
      </div>

      <PurchaseOrderForm />
    </div>
  );
}


