import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSupplierSession } from '@/lib/supplier-auth';
import { queryOne } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';
import { SupplierMarginApprovalForm } from './supplier-margin-approval-form';

interface ProductWithMargin {
  id: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string;
  admin_proposed_margin_percent: string;
  supplier_margin_approval_status: string;
  admin_proposed_margin_at: string | null;
  admin_proposed_margin_by: string;
  margin_proposal_source: string;
  approval_status: string;
  supplier_id: string;
  admin_name: string;
  attributes: {
    containerSizes?: string;
  } | null;
}

async function getProductWithAdminMarginProposal(id: string, supplierId: string): Promise<ProductWithMargin | null> {
  return queryOne<ProductWithMargin>(
    `SELECT
      p.id, p.name, p.category, p.price, COALESCE(p.supplier_price, p.original_price) as supplier_price,
      p.admin_proposed_margin_percent, p.supplier_margin_approval_status,
      p.admin_proposed_margin_at, p.admin_proposed_margin_by, p.margin_proposal_source,
      p.approval_status, p.supplier_id, p.attributes,
      au.name as admin_name
    FROM products p
    LEFT JOIN admin_users au ON au.id = p.admin_proposed_margin_by
    WHERE p.id = $1 AND p.supplier_id = $2 
      AND p.deleted_at IS NULL
      AND p.margin_proposal_source = 'admin'
      AND p.supplier_margin_approval_status = 'pending'`,
    [id, supplierId]
  );
}

export default async function SupplierMarginApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSupplierSession();
  if (!session) {
    redirect('/supplier/login');
  }

  const { id } = await params;
  const product = await getProductWithAdminMarginProposal(id, session.user.id);

  if (!product) {
    notFound();
  }

  if (!product.admin_proposed_margin_percent) {
    return (
      <div>
        <Link
          href="/supplier/products"
          className="mb-4 flex items-center space-x-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Products</span>
        </Link>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <h2 className="text-lg font-semibold text-yellow-800">No Margin Proposal</h2>
          <p className="mt-2 text-yellow-700">This product does not have a pending margin proposal from admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/supplier/products"
          className="mb-4 flex items-center space-x-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Products</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Margin Approval Request</h1>
        <p className="mt-1 text-slate-500">
          Review admin&apos;s proposed margin split for {product.name}
        </p>
      </div>

      <SupplierMarginApprovalForm product={product} />
    </div>
  );
}
