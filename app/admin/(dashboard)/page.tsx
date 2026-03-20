import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { getRecentActivity } from '@/lib/audit';
import { StatCard } from '@/components/admin/stat-card';
import { 
  Package, 
  ShoppingCart, 
  Users, 
  DollarSign,
  Clock,
  FileWarning,
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  totalRevenue: number;
  pendingOrders: number;
  recentOrdersCount: number;
}

async function getDashboardStats(): Promise<DashboardStats> {
  const [products, orders, users, revenue, pending, recentOrders] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM products'),
    queryOne<{ count: string }>("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'"),
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM "user"'),
    queryOne<{ total: string }>("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'"),
    queryOne<{ count: string }>("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'"),
    queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM orders WHERE created_at > NOW() - INTERVAL '7 days' AND status != 'cancelled'"
    ),
  ]);

  return {
    totalProducts: parseInt(products?.count || '0', 10),
    totalOrders: parseInt(orders?.count || '0', 10),
    totalUsers: parseInt(users?.count || '0', 10),
    totalRevenue: parseFloat(revenue?.total || '0'),
    pendingOrders: parseInt(pending?.count || '0', 10),
    recentOrdersCount: parseInt(recentOrders?.count || '0', 10),
  };
}

interface RecentOrder {
  id: string;
  order_number: string;
  total: string;
  status: string;
  created_at: string;
  user_email: string;
}

async function getRecentOrders(): Promise<RecentOrder[]> {
  return query<RecentOrder>(
    `SELECT o.id, o.order_number, o.total, o.status, o.created_at, u.email as user_email
     FROM orders o
     JOIN "user" u ON u.id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT 5`
  );
}

interface ExpiringContract {
  id: string;
  contract_type: string;
  expiry_date: string;
  supplier_company_name: string;
  days_until_expiry: number;
}

async function getExpiringContracts(): Promise<ExpiringContract[]> {
  return query<ExpiringContract>(
    `SELECT
       sc.id,
       sc.contract_type,
       sc.expiry_date::text,
       su.company_name as supplier_company_name,
       (sc.expiry_date - CURRENT_DATE)::int as days_until_expiry
     FROM supplier_contracts sc
     JOIN supplier_users su ON sc.supplier_id = su.id
     WHERE sc.status = 'active'
       AND sc.expiry_date IS NOT NULL
       AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
     ORDER BY sc.expiry_date ASC`
  ).catch(() => []);
}

export default async function AdminDashboard() {
  // Check if DATABASE_URL is configured first
  if (!process.env.DATABASE_URL) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900 mb-2">Database Not Configured</h2>
        <p className="text-red-700">
          The DATABASE_URL environment variable is not set. Please configure your database connection in your .env.local file.
        </p>
      </div>
    );
  }
  
  let session, stats, recentOrders, recentActivity, expiringContracts;
  try {
    session = await getAdminSession();
    [stats, recentOrders, recentActivity, expiringContracts] = await Promise.all([
      getDashboardStats(),
      getRecentOrders(),
      getRecentActivity(5),
      getExpiringContracts(),
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900 mb-2">Error Loading Dashboard</h2>
        <p className="text-red-700">
          Failed to load dashboard data. Please check your database connection.
        </p>
        <p className="text-sm text-red-600 mt-2">
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {session?.user.name || 'Admin'}
        </h1>
        <p className="mt-1 text-slate-500">
          Here&apos;s what&apos;s happening with your store today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={<DollarSign className="h-6 w-6" />}
          trend={{ value: 12.5, label: 'from last month' }}
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          icon={<ShoppingCart className="h-6 w-6" />}
          trend={{ value: stats.recentOrdersCount, label: 'this week' }}
        />
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={<Package className="h-6 w-6" />}
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={<Users className="h-6 w-6" />}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
            <Link
              href="/admin/orders"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">#{order.order_number}</p>
                    <p className="text-sm text-slate-500">{order.user_email}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {formatCurrency(parseFloat(order.total))}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColors[order.status] || 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
            <Link
              href="/admin/audit-log"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 p-3"
                >
                  <div className="rounded-full bg-slate-100 p-2">
                    <Clock className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{activity.admin_name || 'Admin'}</span>{' '}
                      {activity.action} {activity.resource_type}
                      {activity.resource_id && (
                        <span className="text-slate-500"> #{activity.resource_id.slice(0, 8)}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(activity.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Orders Alert */}
      {stats.pendingOrders > 0 && (
        <div className="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-yellow-800">
                {stats.pendingOrders} pending order{stats.pendingOrders !== 1 ? 's' : ''} awaiting
                processing
              </p>
              <Link
                href="/admin/orders?status=pending"
                className="text-sm text-yellow-700 underline hover:text-yellow-800"
              >
                Review now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Expiring Contracts Alert */}
      {expiringContracts && expiringContracts.length > 0 && (
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 p-2 mt-0.5 shrink-0">
              <FileWarning className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-orange-800 mb-2">
                {expiringContracts.length} contract{expiringContracts.length !== 1 ? 's' : ''} expiring within 30 days
              </p>
              <div className="space-y-1 mb-2">
                {expiringContracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-orange-700 truncate">
                      {c.supplier_company_name} &mdash; {c.contract_type}
                    </span>
                    <span className={`ml-3 shrink-0 font-semibold ${c.days_until_expiry <= 7 ? 'text-red-700' : c.days_until_expiry <= 14 ? 'text-orange-700' : 'text-orange-600'}`}>
                      {c.days_until_expiry} day{c.days_until_expiry !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/admin/partners/contracts?status=active"
                className="text-sm text-orange-700 underline hover:text-orange-800"
              >
                Review contracts
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

