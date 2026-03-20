import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';

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

// GET /api/admin/analytics - Get analytics data
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('analytics.view_sales');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const periodStr = searchParams.get('period') || '30'; // days
  const period = parseInt(periodStr, 10);

  try {
    // Sales over time
    const salesOverTime = await query<SalesData>(
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
    );

    // Total stats for period
    const periodStats = await queryOne<{
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
    );

    // Previous period stats for comparison
    const prevPeriodStats = await queryOne<{
      total_revenue: string;
      total_orders: string;
    }>(
      `SELECT 
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) as total_orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
        AND status != 'cancelled'`,
      [period * 2, period]
    );

    // Top selling products
    const topProducts = await query<TopProduct>(
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
    );

    // Orders by status
    const ordersByStatus = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY status`,
      [period]
    );

    // Recent orders count by day of week
    const ordersByDayOfWeek = await query<{ day: string; count: string }>(
      `SELECT 
        TO_CHAR(created_at, 'Day') as day,
        COUNT(*) as count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY TO_CHAR(created_at, 'Day'), EXTRACT(DOW FROM created_at)
      ORDER BY EXTRACT(DOW FROM created_at)`,
      [period]
    );

    // Calculate growth percentages
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

    return NextResponse.json({
      period,
      summary: {
        total_revenue: periodStats?.total_revenue || '0',
        total_orders: periodStats?.total_orders || '0',
        avg_order_value: periodStats?.avg_order_value || '0',
        revenue_growth: revenueGrowth.toFixed(1),
        orders_growth: ordersGrowth.toFixed(1),
      },
      sales_over_time: salesOverTime,
      top_products: topProducts,
      orders_by_status: ordersByStatus,
      orders_by_day: ordersByDayOfWeek,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

