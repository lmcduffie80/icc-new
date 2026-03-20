import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DollarSign, Package, AlertCircle } from 'lucide-react';
import { MarginApprovalCard } from './margin-approval-card';

interface Product {
  id: string;
  name: string;
  image: string | null;
  price: string;
  supplier_price: string;
  icc_margin_percent: string;
  icc_margin_amount: string;
  customer_margin_percent: string;
  customer_margin_amount: string;
  margin_approval_status: string;
  approval_status: string;
  supplier_name: string;
  created_at: string;
}

async function getMarginApprovals(status: string) {
  // If status is 'all', show all products with margins regardless of approval status
  if (status === 'all') {
    return query<Product>(
      `SELECT 
        p.id, p.name, p.image, p.price, COALESCE(p.supplier_price, p.original_price) as supplier_price,
        COALESCE(p.icc_margin_percent, p.margin_split_percentage) as icc_margin_percent,
        COALESCE(
          p.icc_margin_amount, 
          ((p.price - COALESCE(p.supplier_price, p.original_price)) * COALESCE(p.icc_margin_percent, p.margin_split_percentage)) / 100
        ) as icc_margin_amount,
        (100 - COALESCE(p.icc_margin_percent, p.margin_split_percentage)) as customer_margin_percent,
        COALESCE(
          p.customer_margin_amount,
          ((p.price - COALESCE(p.supplier_price, p.original_price)) - ((p.price - COALESCE(p.supplier_price, p.original_price)) * COALESCE(p.icc_margin_percent, p.margin_split_percentage) / 100))
        ) as customer_margin_amount,
        p.margin_approval_status, p.approval_status, p.created_at,
        su.company_name as supplier_name
      FROM products p
      INNER JOIN supplier_users su ON p.supplier_id = su.id
      WHERE p.deleted_at IS NULL
        AND (p.icc_margin_percent IS NOT NULL OR p.margin_split_percentage IS NOT NULL)
      ORDER BY p.created_at DESC`
    );
  }
  
  // Original query for specific statuses
  return query<Product>(
    `SELECT 
      p.id, p.name, p.image, p.price, COALESCE(p.supplier_price, p.original_price) as supplier_price,
      COALESCE(p.icc_margin_percent, p.margin_split_percentage) as icc_margin_percent,
      COALESCE(
        p.icc_margin_amount, 
        ((p.price - COALESCE(p.supplier_price, p.original_price)) * COALESCE(p.icc_margin_percent, p.margin_split_percentage)) / 100
      ) as icc_margin_amount,
      (100 - COALESCE(p.icc_margin_percent, p.margin_split_percentage)) as customer_margin_percent,
      COALESCE(
        p.customer_margin_amount,
        ((p.price - COALESCE(p.supplier_price, p.original_price)) - ((p.price - COALESCE(p.supplier_price, p.original_price)) * COALESCE(p.icc_margin_percent, p.margin_split_percentage) / 100))
      ) as customer_margin_amount,
      p.margin_approval_status, p.approval_status, p.created_at,
      su.company_name as supplier_name
    FROM products p
    INNER JOIN supplier_users su ON p.supplier_id = su.id
    WHERE p.deleted_at IS NULL
      AND p.margin_approval_status = $1
      AND (p.icc_margin_percent IS NOT NULL OR p.margin_split_percentage IS NOT NULL)
      AND (p.approval_status = 'published' OR p.approval_status = 'pending')
    ORDER BY p.created_at DESC`,
    [status]
  );
}

async function getMarginApprovalCounts() {
  const result = await query<{ status: string; count: number }>(
    `SELECT 
      margin_approval_status as status,
      COUNT(*)::int as count
    FROM products
    WHERE (approval_status = 'published' OR approval_status = 'pending')
      AND (icc_margin_percent IS NOT NULL OR margin_split_percentage IS NOT NULL)
    GROUP BY margin_approval_status`
  );
  
  // Get total count for "All" tab (regardless of product approval status)
  const allResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM products
     WHERE (icc_margin_percent IS NOT NULL OR margin_split_percentage IS NOT NULL)
       AND supplier_id IS NOT NULL`
  );
  
  return {
    all: allResult?.count || 0,
    pending: result.find(r => r.status === 'pending')?.count || 0,
    approved: result.find(r => r.status === 'approved')?.count || 0,
    rejected: result.find(r => r.status === 'rejected')?.count || 0,
  };
}

export default async function MarginApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.permissions.includes('products.approve_margin') && 
      !session?.permissions.includes('products.update')) {
    redirect('/admin');
  }
  
  const { status = 'pending' } = await searchParams;
  const products = await getMarginApprovals(status);
  const counts = await getMarginApprovalCounts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-emerald-600" />
            Margin Approvals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review and approve supplier margin split requests
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            href="/admin/margin-approvals?status=all"
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              status === 'all'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            All Products
            {counts.all > 0 && (
              <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {counts.all}
              </span>
            )}
          </Link>
          <Link
            href="/admin/margin-approvals?status=pending"
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              status === 'pending'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Pending
            {counts.pending > 0 && (
              <span className="ml-2 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                {counts.pending}
              </span>
            )}
          </Link>
          <Link
            href="/admin/margin-approvals?status=approved"
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              status === 'approved'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Approved
            {counts.approved > 0 && (
              <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {counts.approved}
              </span>
            )}
          </Link>
          <Link
            href="/admin/margin-approvals?status=rejected"
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              status === 'rejected'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            Rejected
            {counts.rejected > 0 && (
              <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {counts.rejected}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Content */}
      <Suspense fallback={<div className="text-center py-8 text-slate-500">Loading...</div>}>
        {products.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
            <Package className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">
              No {status} margin approvals
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {status === 'pending'
                ? 'All margin splits have been reviewed.'
                : `No products with ${status} margin status.`}
            </p>
          </div>
        ) : (
          <>
            {/* Info Banners */}
            {status === 'all' && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-slate-600" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-slate-800">
                      All Products with Margins
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">
                      This view shows all supplier products that have ICC margins configured, 
                      regardless of product or margin approval status. Products must be published 
                      before margins can be approved.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {status === 'pending' && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      About Margin Approvals
                    </h3>
                    <p className="mt-1 text-sm text-blue-700">
                      These products require margin split approval. Some may still be pending product approval.
                      Suppliers have specified what percentage they want ICC to receive from each sale.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Grid of Margin Approval Cards */}
            <div className="grid gap-6">
              {products.map((product) => (
                <MarginApprovalCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </Suspense>
    </div>
  );
}
