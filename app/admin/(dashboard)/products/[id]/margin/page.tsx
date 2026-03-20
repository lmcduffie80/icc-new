import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';
import { MarginApprovalForm } from '@/components/admin/margin-approval-form';

interface ProductWithMargin {
  id: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string;
  margin_split_percentage: string;
  margin_approval_status: string;
  margin_approval_notes: string | null;
  margin_submitted_at: string | null;
  approval_status: string;
  supplier_id: string;
  supplier_name: string;
  supplier_company: string;
  supplier_email: string;
}

async function getProductWithMargin(id: string): Promise<ProductWithMargin | null> {
  return queryOne<ProductWithMargin>(
    `SELECT
      p.id, p.name, p.category, p.price, p.supplier_price,
      p.margin_split_percentage, p.margin_approval_status, p.margin_approval_notes,
      p.margin_submitted_at, p.approval_status, p.supplier_id,
      su.name as supplier_name, su.company_name as supplier_company, su.email as supplier_email
    FROM products p
    LEFT JOIN supplier_users su ON su.id = p.supplier_id
    WHERE p.id = $1 AND p.supplier_id IS NOT NULL`,
    [id]
  );
}

export default async function MarginApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  // Check permission
  if (!session.permissions.includes('products.approve_margin') && !session.permissions.includes('products.update')) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
        <p className="mt-2 text-red-700">You do not have permission to approve margins.</p>
      </div>
    );
  }

  const { id } = await params;
  const product = await getProductWithMargin(id);

  if (!product) {
    notFound();
  }

  if (product.margin_split_percentage === null) {
    return (
      <div>
        <Link
          href="/admin/margin-approvals"
          className="mb-4 flex items-center space-x-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Margin Approvals</span>
        </Link>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <h2 className="text-lg font-semibold text-yellow-800">No Margin Set</h2>
          <p className="mt-2 text-yellow-700">This product does not have a margin split percentage set.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/margin-approvals"
          className="mb-4 flex items-center space-x-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Margin Approvals</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Margin Approval</h1>
        <p className="mt-1 text-slate-500">
          Review margin split request for {product.name}
        </p>
      </div>

      <MarginApprovalForm product={product} />
    </div>
  );
}
