import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { query } from '@/lib/db';

interface MonthlyRow {
  month: string;
  products_sold: string;
  revenue: string;
  icc_payout: string;
  supplier_payout: string;
}

export async function GET(request: NextRequest) {
  const session = await getSupplierSession();
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    const supplierId = session.user.id;

    // Get monthly breakdown
    const monthlyQuery = `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') as month,
        SUM(oi.quantity) as products_sold,
        SUM(oi.quantity * oi.price) as revenue,
        SUM(
          oi.quantity * (oi.price - COALESCE(p.supplier_price, 0)) * 
          COALESCE(p.margin_split_percentage, 0) / 100
        ) as icc_payout,
        SUM(
          oi.quantity * COALESCE(p.supplier_price, 0) + 
          oi.quantity * (oi.price - COALESCE(p.supplier_price, 0)) * 
          (100 - COALESCE(p.margin_split_percentage, 0)) / 100
        ) as supplier_payout
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.status NOT IN ('cancelled', 'refunded')
        AND p.deleted_at IS NULL
        AND COALESCE(oi.supplier_id, p.supplier_id) = $1
        ${startDate ? 'AND o.created_at >= $2::timestamp' : ''}
        ${endDate ? `AND o.created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY month
      ORDER BY month DESC
    `;

    // Get per-product breakdown
    const productQuery = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.quantity * oi.price) as total_revenue,
        SUM(
          oi.quantity * (oi.price - COALESCE(p.supplier_price, 0)) * 
          COALESCE(p.margin_split_percentage, 0) / 100
        ) as icc_share,
        SUM(
          oi.quantity * COALESCE(p.supplier_price, 0) + 
          oi.quantity * (oi.price - COALESCE(p.supplier_price, 0)) * 
          (100 - COALESCE(p.margin_split_percentage, 0)) / 100
        ) as supplier_share,
        COALESCE(p.margin_split_percentage, 0) as margin_split_percentage
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.status NOT IN ('cancelled', 'refunded')
        AND p.deleted_at IS NULL
        AND COALESCE(oi.supplier_id, p.supplier_id) = $1
        ${startDate ? 'AND o.created_at >= $2::timestamp' : ''}
        ${endDate ? `AND o.created_at <= $${startDate ? '3' : '2'}::timestamp` : ''}
      GROUP BY p.id, p.name, p.margin_split_percentage
      ORDER BY total_revenue DESC
    `;

    const params = [supplierId, startDate, endDate].filter(Boolean);

    const [monthlyData, productData] = await Promise.all([
      query(monthlyQuery, params),
      query(productQuery, params),
    ]);

    // Calculate totals
    const totals = {
      revenue: 0,
      productsSold: 0,
      iccPayout: 0,
      supplierPayout: 0,
    };

    (monthlyData as MonthlyRow[]).forEach((row) => {
      totals.revenue += parseFloat(row.revenue) || 0;
      totals.productsSold += parseInt(row.products_sold) || 0;
      totals.iccPayout += parseFloat(row.icc_payout) || 0;
      totals.supplierPayout += parseFloat(row.supplier_payout) || 0;
    });

    return NextResponse.json({
      monthly: monthlyData,
      products: productData,
      totals,
    });
  } catch (error) {
    console.error('Error fetching supplier financial data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data' },
      { status: 500 }
    );
  }
}
