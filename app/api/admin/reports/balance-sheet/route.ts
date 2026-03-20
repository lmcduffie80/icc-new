import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface BalanceSheetData {
  assets: {
    inventory: number;
    accountsReceivable: number;
    total: number;
  };
  liabilities: {
    accountsPayable: number;
    total: number;
  };
  equity: {
    total: number;
  };
}

interface InventoryRow {
  inventory_value: string | null;
}

interface ARRow {
  accounts_receivable: string | null;
}

interface APRow {
  accounts_payable: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  // Check specific permission
  if (!auth.session.permissions.includes('reports.view_balance_sheet')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // Assets: Inventory Value (current stock at cost)
    const inventoryQuery = `
      SELECT SUM(inventory_count * COALESCE(cost, 0)) as inventory_value
      FROM products
      WHERE in_stock = true AND inventory_count > 0
    `;

    // Assets: Accounts Receivable (delivered orders - assuming pending payment)
    const arQuery = `
      SELECT SUM(total) as accounts_receivable
      FROM orders
      WHERE status IN ('delivered', 'shipped')
        ${startDate ? 'AND created_at >= $1::timestamp' : ''}
        ${endDate ? `AND created_at <= $${startDate ? '2' : '1'}::timestamp` : ''}
    `;

    // Liabilities: Accounts Payable (approved/sent POs not yet received)
    const apQuery = `
      SELECT SUM(total_amount) as accounts_payable
      FROM purchase_orders
      WHERE status IN ('APPROVED', 'SENT')
        ${startDate ? 'AND created_at >= $1::timestamp' : ''}
        ${endDate ? `AND created_at <= $${startDate ? '2' : '1'}::timestamp` : ''}
    `;

    const dateParams = [startDate, endDate].filter(Boolean);

    const [inventoryResult, arResult, apResult] = await Promise.all([
      query<InventoryRow>(inventoryQuery),
      query<ARRow>(arQuery, dateParams),
      query<APRow>(apQuery, dateParams),
    ]);

    const inventory = parseFloat(inventoryResult[0]?.inventory_value || '0');
    const accountsReceivable = parseFloat(arResult[0]?.accounts_receivable || '0');
    const accountsPayable = parseFloat(apResult[0]?.accounts_payable || '0');

    const assets = {
      inventory,
      accountsReceivable,
      total: inventory + accountsReceivable,
    };

    const liabilities = {
      accountsPayable,
      total: accountsPayable,
    };

    const equity = {
      total: assets.total - liabilities.total,
    };

    const data: BalanceSheetData = {
      assets,
      liabilities,
      equity,
    };

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching balance sheet data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance sheet data' },
      { status: 500 }
    );
  }
}
