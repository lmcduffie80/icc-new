import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface FinancialDataPoint {
  date: string;
  revenue: number;
  spending: number;
  net: number;
}

interface RevenueRow {
  period: Date;
  revenue: string;
}

interface SpendingRow {
  period: Date;
  spending: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  // Check specific permission
  if (!auth.session.permissions.includes('reports.view_overview')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || 'month'; // day, week, month

  try {
    // Revenue: completed/delivered orders
    const revenueQuery = `
      SELECT 
        DATE_TRUNC($1, created_at) as period,
        SUM(total) as revenue
      FROM orders
      WHERE status IN ('delivered', 'shipped')
        ${startDate ? 'AND created_at >= $2::timestamp' : ''}
        ${endDate ? `AND created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY period
      ORDER BY period ASC
    `;

    // PO Spending: approved/sent POs
    const spendingQuery = `
      SELECT 
        DATE_TRUNC($1, created_at) as period,
        SUM(total_amount) as spending
      FROM purchase_orders
      WHERE status IN ('APPROVED', 'SENT')
        ${startDate ? 'AND created_at >= $2::timestamp' : ''}
        ${endDate ? `AND created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY period
      ORDER BY period ASC
    `;

    const revenueParams = [period, startDate, endDate].filter(Boolean);
    const spendingParams = [period, startDate, endDate].filter(Boolean);

    const [revenueResult, spendingResult] = await Promise.all([
      query<RevenueRow>(revenueQuery, revenueParams),
      query<SpendingRow>(spendingQuery, spendingParams),
    ]);

    // Merge data by period
    const dataMap = new Map<string, FinancialDataPoint>();

    revenueResult.forEach((row) => {
      const date = new Date(row.period).toISOString().split('T')[0];
      dataMap.set(date, {
        date,
        revenue: parseFloat(row.revenue) || 0,
        spending: 0,
        net: 0,
      });
    });

    spendingResult.forEach((row) => {
      const date = new Date(row.period).toISOString().split('T')[0];
      const existing = dataMap.get(date) || { date, revenue: 0, spending: 0, net: 0 };
      existing.spending = parseFloat(row.spending) || 0;
      dataMap.set(date, existing);
    });

    // Calculate net for each period
    const data = Array.from(dataMap.values()).map(item => ({
      ...item,
      net: item.revenue - item.spending,
    }));

    // Calculate totals
    const totals = data.reduce(
      (acc, item) => ({
        revenue: acc.revenue + item.revenue,
        spending: acc.spending + item.spending,
        net: acc.net + item.net,
      }),
      { revenue: 0, spending: 0, net: 0 }
    );

    return NextResponse.json({ data, totals });
  } catch (error) {
    console.error('Error fetching financial data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data' },
      { status: 500 }
    );
  }
}
