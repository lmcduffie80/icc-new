import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { redirect } from 'next/navigation';
import { StatCard } from '@/components/admin/stat-card';
import { DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react';
import { AnalyticsCharts } from './analytics-charts';

interface SalesData {
  date: string;
  revenue: string;
  orders: string;
}

interface TopProduct {
  product_id: string;
  name: string;
  total_quantity: string;
  total_revenue: string;
}

async function getAnalyticsData(period: number = 30) {
  const [salesOverTime, periodStats, prevPeriodStats, topProducts, ordersByStatus] = await Promise.all([
    query<SalesData>(
      `SELECT 
        DATE(created_at) as date,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [period]
    ),
    queryOne<{
      total_revenue: string;
      total_orders: string;
      avg_order_value: string;
    }>(
      `SELECT 
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) as total_orders,
        COALESCE(AVG(total), 0) as avg_order_value
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        AND status != 'cancelled'`,
      [period]
    ),
    queryOne<{ total_revenue: string; total_orders: string }>(
      `SELECT 
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) as total_orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
        AND status != 'cancelled'`,
      [period * 2, period]
    ),
    query<TopProduct>(
      `SELECT 
        oi.product_id,
        oi.name,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= NOW() - INTERVAL '1 day' * $1
        AND o.status != 'cancelled'
      GROUP BY oi.product_id, oi.name
      ORDER BY total_revenue DESC
      LIMIT 5`,
      [period]
    ),
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY status`,
      [period]
    ),
  ]);

  const currentRevenue = parseFloat(periodStats?.total_revenue || '0');
  const prevRevenue = parseFloat(prevPeriodStats?.total_revenue || '0');
  const revenueGrowth = prevRevenue > 0 
    ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 
    : 0;

  const currentOrders = parseInt(periodStats?.total_orders || '0', 10);
  const prevOrders = parseInt(prevPeriodStats?.total_orders || '0', 10);
  const ordersGrowth = prevOrders > 0 
    ? ((currentOrders - prevOrders) / prevOrders) * 100 
    : 0;

  return {
    summary: {
      total_revenue: periodStats?.total_revenue || '0',
      total_orders: periodStats?.total_orders || '0',
      avg_order_value: periodStats?.avg_order_value || '0',
      revenue_growth: revenueGrowth,
      orders_growth: ordersGrowth,
    },
    sales_over_time: salesOverTime,
    top_products: topProducts,
    orders_by_status: ordersByStatus,
  };
}

export default async function AnalyticsPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('analytics.view_sales')) {
    redirect('/admin');
  }

  const data = await getAnalyticsData(30);

  const formatCurrency = (amount: string | number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      typeof amount === 'string' ? parseFloat(amount) : amount
    );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-slate-500">Sales performance and insights (Last 30 days)</p>
      </div>

      {/* Summary Stats */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.summary.total_revenue)}
          icon={<DollarSign className="h-6 w-6" />}
          trend={{
            value: parseFloat(data.summary.revenue_growth.toFixed(1)),
            label: 'vs last period',
          }}
        />
        <StatCard
          title="Total Orders"
          value={data.summary.total_orders}
          icon={<ShoppingCart className="h-6 w-6" />}
          trend={{
            value: parseFloat(data.summary.orders_growth.toFixed(1)),
            label: 'vs last period',
          }}
        />
        <StatCard
          title="Avg Order Value"
          value={formatCurrency(data.summary.avg_order_value)}
          icon={<TrendingUp className="h-6 w-6" />}
        />
        <StatCard
          title="Top Products"
          value={data.top_products.length}
          icon={<Package className="h-6 w-6" />}
        />
      </div>

      {/* Charts */}
      <AnalyticsCharts
        salesData={data.sales_over_time}
        ordersByStatus={data.orders_by_status}
      />

      {/* Top Products */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg mb-4 font-semibold text-slate-900">Top Selling Products</h2>
        {data.top_products.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">No sales data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-3 text-left text-sm font-medium text-slate-600">Product</th>
                  <th className="pb-3 text-right text-sm font-medium text-slate-600">Units Sold</th>
                  <th className="pb-3 text-right text-sm font-medium text-slate-600">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map((product, index) => (
                  <tr key={product.product_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-600">
                          {index + 1}
                        </span>
                        <span className="font-medium text-slate-900">{product.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-slate-600">{product.total_quantity}</td>
                    <td className="py-3 text-right font-medium text-slate-900">
                      {formatCurrency(product.total_revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

