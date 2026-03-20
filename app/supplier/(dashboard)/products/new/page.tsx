import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { SupplierProductForm } from '@/components/supplier/product-form';

export default async function NewProductPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="mt-1 text-slate-500">Create a new product for approval</p>
      </div>

      <SupplierProductForm />
    </div>
  );
}

