import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { SupplierProductForm } from '@/components/supplier/product-form';

async function getProduct(productId: string, supplierId: string) {
  try {
    return await queryOne<{
      id: string;
      name: string;
      category: string;
      description: string | null;
      full_description: string | null;
      price: string;
      supplier_price: string | null;
      original_price: string | null;
      sku: string | null;
      unit_of_measure: string | null;
      image: string | null;
      approval_status: string;
      icc_available_quantity: number;
      label_url: string | null;
      sds_url: string | null;
      admin_label_url: string | null;
      label_template_id: string | null;
      attributes: Record<string, string>;
      approved_states: string[];
      features: string[];
      specifications: Record<string, string>;
      restricted_use: boolean;
      margin_split_percentage: number | null;
      margin_approval_status: string | null;
      margin_approval_notes: string | null;
      icc_margin_percent: string | null;
      icc_margin_amount: string | null;
      customer_margin_percent: string | null;
      customer_margin_amount: string | null;
      margin_approved_at: string | null;
      margin_approved_by: string | null;
    }>(
      `SELECT
        id, name, category, description, full_description,
        price, supplier_price, original_price, sku, unit_of_measure, image,
        approval_status, icc_available_quantity,
        label_url, sds_url, admin_label_url, label_template_id,
        attributes, approved_states, features, specifications,
        restricted_use,
        margin_split_percentage, margin_approval_status, margin_approval_notes,
        icc_margin_percent, icc_margin_amount,
        customer_margin_percent, customer_margin_amount,
        margin_approved_at, margin_approved_by
      FROM products
      WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL`,
      [productId, supplierId]
    );
  } catch (error) {
    console.error('Failed to fetch supplier product:', error);
    return null;
  }
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const { id } = await params;
  const product = await getProduct(id, session.user.id);

  if (!product) {
    redirect('/supplier/products');
  }

  // Transform product for form component
  const formProduct = {
    ...product,
    attributes: product.attributes || null,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
        <p className="mt-1 text-slate-500">Update product information</p>
      </div>

      <SupplierProductForm product={formProduct} />
    </div>
  );
}

