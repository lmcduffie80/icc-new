import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface PLDataPoint {
  period: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
}

interface RevenueRow {
  period: Date;
  revenue: string;
}

interface CogsRow {
  period: Date;
  cogs: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  // Check specific permission
  if (!auth.session.permissions.includes('reports.view_profit_loss')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'month';

  try {
    // Revenue by period from completed orders
    const revenueQuery = `
      SELECT 
        DATE_TRUNC($1, o.created_at) as period,
        SUM(o.total) as revenue
      FROM orders o
      WHERE o.status NOT IN ('cancelled', 'refunded')
        ${startDate ? 'AND o.created_at >= $2::timestamp' : ''}
        ${endDate ? `AND o.created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY period
      ORDER BY period ASC
    `;

    // COGS by period - calculate from order items and product costs
    const cogsQuery = `
      SELECT 
        DATE_TRUNC($1, o.created_at) as period,
        SUM(oi.quantity * COALESCE(p.cost, 0)) as cogs
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id AND p.deleted_at IS NULL
      WHERE o.status NOT IN ('cancelled', 'refunded')
        ${startDate ? 'AND o.created_at >= $2::timestamp' : ''}
        ${endDate ? `AND o.created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY period
      ORDER BY period ASC
    `;

    const params = [period, startDate, endDate].filter(Boolean);

    const [revenueResult, cogsResult] = await Promise.all([
      query<RevenueRow>(revenueQuery, params),
      query<CogsRow>(cogsQuery, params),
    ]);

    // Merge data
    const dataMap = new Map<string, PLDataPoint>();

    revenueResult.forEach((row) => {
      const periodStr = new Date(row.period).toISOString().split('T')[0];
      const revenue = parseFloat(row.revenue) || 0;
      dataMap.set(periodStr, {
        period: periodStr,
        revenue,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
      });
    });

    cogsResult.forEach((row) => {
      const periodStr = new Date(row.period).toISOString().split('T')[0];
      const cogs = parseFloat(row.cogs) || 0;
      const existing = dataMap.get(periodStr);
      if (existing) {
        existing.cogs = cogs;
        existing.grossProfit = existing.revenue - cogs;
        existing.grossMargin = existing.revenue > 0 
          ? (existing.grossProfit / existing.revenue) * 100 
          : 0;
      } else {
        // Period with COGS but no revenue
        dataMap.set(periodStr, {
          period: periodStr,
          revenue: 0,
          cogs,
          grossProfit: -cogs,
          grossMargin: 0,
        });
      }
    });

    const data = Array.from(dataMap.values()).sort((a, b) => 
      a.period.localeCompare(b.period)
    );

    // Calculate totals
    const totals = data.reduce(
      (acc, item) => ({
        revenue: acc.revenue + item.revenue,
        cogs: acc.cogs + item.cogs,
        grossProfit: acc.grossProfit + item.grossProfit,
        grossMargin: 0,
      }),
      { revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0 }
    );
    totals.grossMargin = totals.revenue > 0 
      ? (totals.grossProfit / totals.revenue) * 100 
      : 0;

    return NextResponse.json({ data, totals });
  } catch (error) {
    console.error('Error fetching P&L data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch P&L data' },
      { status: 500 }
    );
  }
}
