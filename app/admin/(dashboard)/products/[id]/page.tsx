import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect, notFound } from 'next/navigation';
import { ProductForm } from '../product-form';

export const dynamic = 'force-dynamic';

async function getProduct(id: string) {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] ?? null;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();

  if (!session?.permissions.includes('products.update')) {
    redirect('/admin/products');
  }

  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
        <p className="mt-1 text-slate-500">Update product details</p>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ProductForm product={product as any} />
    </div>
  );
}
