import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { ProductForm } from '../product-form';

export default async function NewProductPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('products.create')) {
    redirect('/admin/products');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="mt-1 text-slate-500">Create a new product in your catalog</p>
      </div>

      <ProductForm />
    </div>
  );
}

