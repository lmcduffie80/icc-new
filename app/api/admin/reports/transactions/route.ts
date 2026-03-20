import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import type { InventoryTransaction, TransactionType } from '@/lib/inventory-transactions';

interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  transaction_type?: TransactionType;
  product_id?: string;
  warehouse_id?: string;
  supplier_id?: string;
  reference_doc_id?: string;
  search?: string; // Search by product name, SKU, transaction number
}

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}


export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  // Check specific permission
  if (!auth.session.permissions.includes('reports.view_transactions')) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Required permission: reports.view_transactions' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  // Extract filters
  const filters: TransactionFilters = {
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    transaction_type: (searchParams.get('transaction_type') as TransactionType) || undefined,
    product_id: searchParams.get('product_id') || undefined,
    warehouse_id: searchParams.get('warehouse_id') || undefined,
    supplier_id: searchParams.get('supplier_id') || undefined,
    reference_doc_id: searchParams.get('reference_doc_id') || undefined,
    search: searchParams.get('search') || undefined,
  };

  // Extract pagination parameters
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100); // Max 100 per page
  const pagination: PaginationParams = {
    page: Math.max(1, page),
    limit,
    offset: (Math.max(1, page) - 1) * limit,
  };

  try {
    // Build WHERE clause dynamically based on filters
    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      whereClauses.push(`posting_date >= $${paramIndex}::date`);
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereClauses.push(`posting_date <= $${paramIndex}::date`);
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    if (filters.transaction_type) {
      whereClauses.push(`transaction_type = $${paramIndex}::transaction_type`);
      queryParams.push(filters.transaction_type);
      paramIndex++;
    }

    if (filters.product_id) {
      whereClauses.push(`product_id = $${paramIndex}`);
      queryParams.push(filters.product_id);
      paramIndex++;
    }

    if (filters.warehouse_id) {
      whereClauses.push(`(warehouse_id = $${paramIndex} OR from_warehouse_id = $${paramIndex} OR to_warehouse_id = $${paramIndex})`);
      queryParams.push(filters.warehouse_id);
      paramIndex++;
    }

    if (filters.supplier_id) {
      whereClauses.push(`supplier_id = $${paramIndex}`);
      queryParams.push(filters.supplier_id);
      paramIndex++;
    }

    if (filters.reference_doc_id) {
      whereClauses.push(`reference_doc_id = $${paramIndex}`);
      queryParams.push(filters.reference_doc_id);
      paramIndex++;
    }

    if (filters.search) {
      whereClauses.push(`(
        product_name ILIKE $${paramIndex} OR 
        product_sku ILIKE $${paramIndex} OR 
        transaction_number ILIKE $${paramIndex} OR
        reference_doc_number ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM inventory_transactions
      ${whereClause}
    `;

    const countResult = await queryOne<{ total_count: string }>(countQuery, queryParams);
    const totalCount = parseInt(countResult?.total_count || '0', 10);

    // Get paginated transactions
    const transactionsQuery = `
      SELECT *
      FROM inventory_transactions
      ${whereClause}
      ORDER BY posting_date DESC, transaction_date DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const transactions = await query<InventoryTransaction>(
      transactionsQuery,
      [...queryParams, pagination.limit, pagination.offset]
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pagination.limit);
    const hasNextPage = pagination.page < totalPages;
    const hasPrevPage = pagination.page > 1;

    return NextResponse.json({
      transactions,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
      filters,
    });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory transactions' },
      { status: 500 }
    );
  }
}

/**
 * Get transaction summary statistics
 * Useful for dashboard widgets
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  // Check specific permission
  if (!auth.session.permissions.includes('reports.view_transactions')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (startDate) {
      whereClauses.push(`posting_date >= $${paramIndex}::date`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`posting_date <= $${paramIndex}::date`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get transaction counts by type
    const summaryQuery = `
      SELECT 
        transaction_type,
        COUNT(*) as transaction_count,
        SUM(ABS(quantity)) as total_quantity,
        SUM(COALESCE(total_cost, 0)) as total_value
      FROM inventory_transactions
      ${whereClause}
      GROUP BY transaction_type
      ORDER BY transaction_type
    `;

    const summary = await query<{
      transaction_type: TransactionType;
      transaction_count: string;
      total_quantity: string;
      total_value: string;
    }>(summaryQuery, queryParams);

    // Get top products by transaction volume
    const topProductsQuery = `
      SELECT 
        product_id,
        product_name,
        product_sku,
        COUNT(*) as transaction_count,
        SUM(ABS(quantity)) as total_quantity
      FROM inventory_transactions
      ${whereClause}
      GROUP BY product_id, product_name, product_sku
      ORDER BY total_quantity DESC
      LIMIT 10
    `;

    const topProducts = await query<{
      product_id: string;
      product_name: string;
      product_sku: string;
      transaction_count: string;
      total_quantity: string;
    }>(topProductsQuery, queryParams);

    // Get top warehouses by transaction volume
    const warehouseWhereClause = whereClause
      ? `${whereClause} AND warehouse_id IS NOT NULL`
      : 'WHERE warehouse_id IS NOT NULL';
    const topWarehousesQuery = `
      SELECT 
        warehouse_id,
        warehouse_name,
        COUNT(*) as transaction_count,
        SUM(ABS(quantity)) as total_quantity
      FROM inventory_transactions
      ${warehouseWhereClause}
      GROUP BY warehouse_id, warehouse_name
      ORDER BY total_quantity DESC
      LIMIT 10
    `;

    const topWarehouses = await query<{
      warehouse_id: string;
      warehouse_name: string;
      transaction_count: string;
      total_quantity: string;
    }>(topWarehousesQuery, queryParams);

    return NextResponse.json({
      summary: summary.map(row => ({
        transaction_type: row.transaction_type,
        transaction_count: parseInt(row.transaction_count, 10),
        total_quantity: parseFloat(row.total_quantity),
        total_value: parseFloat(row.total_value),
      })),
      topProducts: topProducts.map(row => ({
        product_id: row.product_id,
        product_name: row.product_name,
        product_sku: row.product_sku,
        transaction_count: parseInt(row.transaction_count, 10),
        total_quantity: parseFloat(row.total_quantity),
      })),
      topWarehouses: topWarehouses.map(row => ({
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        transaction_count: parseInt(row.transaction_count, 10),
        total_quantity: parseFloat(row.total_quantity),
      })),
    });
  } catch (error) {
    console.error('Error fetching transaction summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction summary' },
      { status: 500 }
    );
  }
}
