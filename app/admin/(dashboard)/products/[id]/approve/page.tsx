import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { ProductApprovalForm } from '@/components/admin/product-approval-form';

export const dynamic = 'force-dynamic';

async function getProduct(productId: string) {
  return queryOne<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    full_description: string | null;
    price: string;
    supplier_price: string | null;
    sku: string | null;
    unit_of_measure: string | null;
    image: string | null;
    label_url: string | null;
    sds_url: string | null;
    admin_label_url: string | null;
    approval_status: string;
    supplier_id: string | null;
    supplier_company: string | null;
    supplier_email: string | null;
    icc_available_quantity: number;
    attributes: Record<string, string> | null;
    approved_states: string[] | null;
    features: string[] | null;
    specifications: Record<string, string> | null;
    documents: Array<{name: string; url: string}> | null;
    restricted_use: boolean;
  }>(
    `SELECT 
      p.id, p.name, p.category, p.description, p.full_description, p.price, p.supplier_price,
      p.sku, p.unit_of_measure, p.image, p.label_url, p.sds_url, p.admin_label_url,
      p.approval_status, p.supplier_id, p.icc_available_quantity,
      p.attributes, p.approved_states, p.features, p.specifications, p.documents, p.restricted_use,
      su.company_name as supplier_company,
      su.email as supplier_email
    FROM products p
    LEFT JOIN supplier_users su ON su.id = p.supplier_id
    WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [productId]
  );
}

export default async function ApproveProductPage({
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

  if (!product || !product.supplier_id) {
    redirect('/admin/products');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Review Product</h1>
        <p className="mt-1 text-slate-500">Approve or reject supplier product: {product.name}</p>
      </div>

      <ProductApprovalForm product={product} />
    </div>
  );
}

