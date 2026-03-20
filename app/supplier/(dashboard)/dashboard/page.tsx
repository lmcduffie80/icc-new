import { getSupplierSession } from '@/lib/supplier-auth';
import { redirect } from 'next/navigation';
import { queryOne, query } from '@/lib/db';
import Link from 'next/link';
import { DollarSign, ShoppingCart, Package, Clock, Bell, CheckCircle, FileText, Tag, TrendingUp, ChevronRight } from 'lucide-react';

interface RecentOrder {
  order_id: string;
  order_number: string;
  order_status: string;
  order_date: string;
  customer_name: string;
  supplier_total: string;
}

interface PendingLabelApproval {
  id: string;
  name: string;
}

interface PendingContractSignature {
  id: string;
  contract_type: string;
  version: number;
}

interface PendingMarginApproval {
  id: string;
  name: string;
}

interface PendingTasks {
  labelApprovals: PendingLabelApproval[];
  contractSignatures: PendingContractSignature[];
  marginApprovals: PendingMarginApproval[];
  total: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

async function getPendingTasks(supplierId: string): Promise<PendingTasks> {
  try {
    const [labelApprovals, contractSignatures, marginApprovals] = await Promise.all([
      query<PendingLabelApproval>(
        `SELECT id, name FROM products 
         WHERE supplier_id = $1 
           AND approval_status = 'label_pending_supplier_approval' 
           AND deleted_at IS NULL`,
        [supplierId]
      ).catch(() => []),
      query<PendingContractSignature>(
        `SELECT id, contract_type, version FROM supplier_contracts 
         WHERE supplier_id = $1 
           AND status = 'pending_supplier_signature'`,
        [supplierId]
      ).catch(() => []),
      query<PendingMarginApproval>(
        `SELECT id, name FROM products 
         WHERE supplier_id = $1 
           AND supplier_margin_approval_status = 'pending' 
           AND margin_proposal_source = 'admin' 
           AND deleted_at IS NULL`,
        [supplierId]
      ).catch(() => []),
    ]);

    return {
      labelApprovals,
      contractSignatures,
      marginApprovals,
      total: labelApprovals.length + contractSignatures.length + marginApprovals.length,
    };
  } catch (error) {
    console.error('Error fetching pending tasks:', error);
    return { labelApprovals: [], contractSignatures: [], marginApprovals: [], total: 0 };
  }
}

async function getSupplierStats(supplierId: string) {
  const defaults = {
    products: { total: 0, pending: 0, approved: 0, published: 0 },
    orders: { total_orders: 0, total_revenue: '0', pending_orders: 0 },
    recentOrders: [] as RecentOrder[],
    pendingOrders: [] as RecentOrder[],
  };

  try {
    const [productStats, orderStats, recentOrders, pendingOrders] = await Promise.all([
      queryOne<{
        total: number;
        pending: number;
        approved: number;
        published: number;
      }>(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE approval_status = 'pending') as pending,
          COUNT(*) FILTER (WHERE approval_status IN ('admin_approved', 'supplier_approved')) as approved,
          COUNT(*) FILTER (WHERE approval_status = 'published') as published
        FROM products
        WHERE supplier_id = $1 AND deleted_at IS NULL`,
        [supplierId]
      ).catch(() => null),
      queryOne<{
        total_orders: number;
        total_revenue: string;
        pending_orders: number;
      }>(
        `SELECT 
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(oi.price * oi.quantity), 0)::text as total_revenue,
          COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending') as pending_orders
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.supplier_id = $1
          AND p.deleted_at IS NULL`,
        [supplierId]
      ).catch(() => null),
      query<RecentOrder>(
        `SELECT DISTINCT ON (o.id)
          o.id as order_id,
          o.order_number,
          o.status as order_status,
          o.created_at as order_date,
          'Innovative CropCare' as customer_name,
          (
            SELECT COALESCE(SUM(oi2.price * oi2.quantity), 0)::text
            FROM order_items oi2
            JOIN products p2 ON p2.id = oi2.product_id
            WHERE oi2.order_id = o.id AND p2.supplier_id = $1 AND p2.deleted_at IS NULL
          ) as supplier_total
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.supplier_id = $1
          AND p.deleted_at IS NULL
        ORDER BY o.id, o.created_at DESC
        LIMIT 5`,
        [supplierId]
      ).catch(() => []),
      query<RecentOrder>(
        `SELECT DISTINCT ON (o.id)
          o.id as order_id,
          o.order_number,
          o.status as order_status,
          o.created_at as order_date,
          'Innovative CropCare' as customer_name,
          (
            SELECT COALESCE(SUM(oi2.price * oi2.quantity), 0)::text
            FROM order_items oi2
            JOIN products p2 ON p2.id = oi2.product_id
            WHERE oi2.order_id = o.id AND p2.supplier_id = $1 AND p2.deleted_at IS NULL
          ) as supplier_total
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.supplier_id = $1 AND p.deleted_at IS NULL AND o.status = 'pending'
        ORDER BY o.id, o.created_at DESC
        LIMIT 10`,
        [supplierId]
      ).catch(() => []),
    ]);

    return {
      products: productStats || defaults.products,
      orders: orderStats || defaults.orders,
      recentOrders: recentOrders || [],
      pendingOrders: pendingOrders || [],
    };
  } catch (error) {
    console.error('Error fetching supplier stats:', error);
    return defaults;
  }
}

export default async function SupplierDashboardPage() {
  const session = await getSupplierSession();

  if (!session) {
    redirect('/supplier/login');
  }

  const [stats, pendingTasks] = await Promise.all([
    getSupplierStats(session.user.id),
    getPendingTasks(session.user.id),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">Welcome back, {session.user.name}</p>
      </div>

      {/* Pending Tasks Widget */}
      {pendingTasks.total > 0 ? (
        <div className="mb-8 rounded-xl border-2 border-amber-300 bg-amber-50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">
                Pending Tasks
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
                  {pendingTasks.total}
                </span>
              </h2>
              <p className="text-sm text-slate-600">You have items that require your attention.</p>
            </div>
          </div>
          <div className="space-y-3">
            {pendingTasks.labelApprovals.length > 0 && (
              <Link
                href="/supplier/approvals"
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-4 transition-colors hover:bg-amber-50 hover:cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
                    <Tag className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Label Approvals</p>
                    <p className="text-sm text-slate-500">
                      {pendingTasks.labelApprovals.length === 1
                        ? `"${pendingTasks.labelApprovals[0].name}" needs your approval`
                        : `${pendingTasks.labelApprovals.length} product labels need your approval`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                    {pendingTasks.labelApprovals.length}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            )}
            {pendingTasks.contractSignatures.length > 0 && (
              <Link
                href="/supplier/contracts"
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-4 transition-colors hover:bg-amber-50 hover:cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Contract Signatures</p>
                    <p className="text-sm text-slate-500">
                      {pendingTasks.contractSignatures.length === 1
                        ? `${pendingTasks.contractSignatures[0].contract_type} (v${pendingTasks.contractSignatures[0].version}) awaits your signature`
                        : `${pendingTasks.contractSignatures.length} contracts await your signature`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    {pendingTasks.contractSignatures.length}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            )}
            {pendingTasks.marginApprovals.length > 0 && (
              <div className="space-y-2">
                {pendingTasks.marginApprovals.map((product) => (
                  <Link
                    key={product.id}
                    href={`/supplier/products/${product.id}/approve-margin`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-4 transition-colors hover:bg-amber-50 hover:cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Margin Approval</p>
                        <p className="text-sm text-slate-500">
                          New margin proposed for &quot;{product.name}&quot;
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        Review
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">
              All caught up! No pending tasks at this time.
            </p>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Total Revenue</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {formatCurrency(stats.orders.total_revenue)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Total Orders</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {stats.orders.total_orders}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
              <Package className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Total Products</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {stats.products.total}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Pending Approval</p>
              <p className="mt-1 text-2xl font-bold text-yellow-600">
                {stats.products.pending}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pending Orders */}
        <div className="rounded-xl border border-yellow-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Pending Orders
              {stats.orders.pending_orders > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  {stats.orders.pending_orders}
                </span>
              )}
            </h2>
            <Link
              href="/supplier/orders"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
            </Link>
          </div>
          {stats.pendingOrders.length > 0 ? (
            <div className="space-y-3">
              {stats.pendingOrders.map((order) => (
                <Link
                  key={order.order_id}
                  href={`/supplier/orders/${order.order_id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">#{order.order_number}</p>
                    <p className="text-sm text-slate-500">{order.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {formatCurrency(order.supplier_total)}
                    </p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.order_status] || 'bg-slate-100 text-slate-800'}`}>
                      {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No pending orders at this time.
            </p>
          )}
        </div>

        {/* Recent Orders */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
            <Link
              href="/supplier/orders"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
            </Link>
          </div>
          {stats.recentOrders.length > 0 ? (
            <div className="space-y-3">
              {stats.recentOrders.map((order) => (
                <Link
                  key={order.order_id}
                  href={`/supplier/orders/${order.order_id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">#{order.order_number}</p>
                    <p className="text-sm text-slate-500">{order.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {formatCurrency(order.supplier_total)}
                    </p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.order_status] || 'bg-slate-100 text-slate-800'}`}>
                      {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No orders yet. Orders will appear here once customers purchase your products.
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/supplier/warehouses/new"
            className="rounded-lg border border-slate-300 bg-white p-4 text-center font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:cursor-pointer"
          >
            Create Warehouse
          </Link>
          <Link
            href="/supplier/products"
            className="rounded-lg border border-slate-300 bg-white p-4 text-center font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:cursor-pointer"
          >
            View All Products
          </Link>
        </div>
      </div>
    </div>
  );
}
