import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { timePeriodSchema } from '@/lib/validation';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import type { TopProduct, CustomerStats, TimePeriod } from '@/types/reports';

// Helper function to get date filter based on period (with table alias)
function getDateFilter(period: TimePeriod): string {
  switch (period) {
    case 'all_time':
      return "o.created_at >= '1970-01-01'"; // Effectively no filter
    case '30_days':
      return "o.created_at >= NOW() - INTERVAL '30 days'";
    case '90_days':
      return "o.created_at >= NOW() - INTERVAL '90 days'";
    case '180_days':
      return "o.created_at >= NOW() - INTERVAL '180 days'";
    case 'year':
      return "o.created_at >= NOW() - INTERVAL '1 year'";
    default:
      return "o.created_at >= NOW() - INTERVAL '30 days'";
  }
}

// Helper function to get date filter without table alias (for subqueries)
function getSimpleDateFilter(period: TimePeriod, columnName: string = 'created_at'): string {
  // Quote column name if it contains uppercase (for camelCase columns in Postgres)
  const quotedColumn = /[A-Z]/.test(columnName) ? `"${columnName}"` : columnName;
  
  switch (period) {
    case 'all_time':
      return `${quotedColumn} >= '1970-01-01'`; // Effectively no filter
    case '30_days':
      return `${quotedColumn} >= NOW() - INTERVAL '30 days'`;
    case '90_days':
      return `${quotedColumn} >= NOW() - INTERVAL '90 days'`;
    case '180_days':
      return `${quotedColumn} >= NOW() - INTERVAL '180 days'`;
    case 'year':
      return `${quotedColumn} >= NOW() - INTERVAL '1 year'`;
    default:
      return `${quotedColumn} >= NOW() - INTERVAL '30 days'`;
  }
}

// Helper to get interval string for SQL queries
function getPeriodInterval(period: TimePeriod): string {
  switch (period) {
    case 'all_time':
      return '1 year'; // Use 1 year as comparison for all_time
    case '30_days':
      return '30 days';
    case '90_days':
      return '90 days';
    case '180_days':
      return '180 days';
    case 'year':
      return '1 year';
    default:
      return '30 days';
  }
}

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check permission
  if (!session.permissions.includes('reports.view_customers')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Apply rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Validate query parameters
  const searchParams = request.nextUrl.searchParams;
  const periodParam = searchParams.get('period') || '30_days';

  const periodValidation = timePeriodSchema.safeParse(periodParam);
  if (!periodValidation.success) {
    return NextResponse.json(
      { error: 'Invalid time period parameter' },
      { status: 400 }
    );
  }

  const period = periodValidation.data;
  const dateFilter = getDateFilter(period);
  const simpleDateFilter = getSimpleDateFilter(period, 'created_at');

  try {
    // Query top 5 products with supplier information
    const topProducts = await query<TopProduct>(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.category,
        p.image,
        su.id as supplier_id,
        su.company_name as supplier_name,
        su.name as supplier_contact,
        SUM(oi.quantity)::text as total_quantity,
        SUM(oi.price * oi.quantity)::text as total_revenue,
        COUNT(DISTINCT o.user_id)::text as unique_customers,
        AVG(oi.price * oi.quantity)::text as avg_order_value
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN supplier_users su ON su.id = p.supplier_id
      WHERE o.status != 'cancelled'
        AND p.deleted_at IS NULL
        AND ${dateFilter}
      GROUP BY p.id, p.name, p.category, p.image, su.id, su.company_name, su.name
      ORDER BY SUM(oi.price * oi.quantity) DESC
      LIMIT 5`
    );

    // Query customer statistics
    // Note: user table uses camelCase columns (createdAt) from Better Auth
    const userDateFilter = getSimpleDateFilter(period, 'createdAt');
    const statsQuery = await queryOne<{
      total_customers: string;
      active_customers: string;
      new_customers: string;
      total_revenue: string;
    }>(
      `SELECT 
        (SELECT COUNT(DISTINCT id) FROM "user")::text as total_customers,
        (SELECT COUNT(DISTINCT user_id) 
         FROM orders 
         WHERE status != 'cancelled' AND ${simpleDateFilter})::text as active_customers,
        (SELECT COUNT(DISTINCT id) 
         FROM "user" 
         WHERE ${userDateFilter})::text as new_customers,
        (SELECT COALESCE(SUM(total), 0) 
         FROM orders 
         WHERE status != 'cancelled' AND ${simpleDateFilter})::text as total_revenue`
    );

    // Calculate retention rate and avg lifetime value
    const intervalStr = getPeriodInterval(period);
    const prevPeriodCustomers = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text as count
       FROM orders
       WHERE status != 'cancelled'
         AND created_at < NOW() - INTERVAL '${intervalStr}'
         AND created_at >= NOW() - INTERVAL '${intervalStr}' * 2`
    );

    const returningCustomers = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text as count
       FROM orders
       WHERE status != 'cancelled'
         AND ${simpleDateFilter}
         AND user_id IN (
           SELECT DISTINCT user_id 
           FROM orders 
           WHERE status != 'cancelled'
             AND created_at < NOW() - INTERVAL '${intervalStr}'
         )`
    );

    const activeCustomersCount = parseInt(statsQuery?.active_customers || '0');
    const prevCustomersCount = parseInt(prevPeriodCustomers?.count || '0');
    const returningCustomersCount = parseInt(returningCustomers?.count || '0');
    const totalRevenue = parseFloat(statsQuery?.total_revenue || '0');

    const retentionRate = prevCustomersCount > 0 
      ? (returningCustomersCount / prevCustomersCount) * 100 
      : 0;

    const avgLifetimeValue = activeCustomersCount > 0
      ? totalRevenue / activeCustomersCount
      : 0;

    const customerStats: CustomerStats = {
      total_customers: parseInt(statsQuery?.total_customers || '0'),
      active_customers: activeCustomersCount,
      new_customers: parseInt(statsQuery?.new_customers || '0'),
      retention_rate: Math.round(retentionRate * 10) / 10, // Round to 1 decimal
      avg_lifetime_value: Math.round(avgLifetimeValue * 100) / 100, // Round to 2 decimals
    };

    return NextResponse.json({
      topProducts,
      customerStats,
      period,
    });
  } catch (error) {
    console.error('Error fetching customer reports data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer reports data' },
      { status: 500 }
    );
  }
}
