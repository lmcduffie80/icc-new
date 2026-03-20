import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query } from '@/lib/db';

interface ExpiringContract {
  id: string;
  contract_type: string;
  expiry_date: string;
  supplier_name: string;
  supplier_company_name: string;
  days_until_expiry: number;
}

/**
 * GET /api/admin/contracts/expiring-soon
 * Returns active contracts expiring within 30 days, used by the admin dashboard alert.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const auth = await requireAdmin('contracts.view');
  if (auth.error) return auth.error;

  try {
    const contracts = await query<ExpiringContract>(`
      SELECT
        sc.id,
        sc.contract_type,
        sc.expiry_date::text,
        su.name as supplier_name,
        su.company_name as supplier_company_name,
        (sc.expiry_date - CURRENT_DATE)::int as days_until_expiry
      FROM supplier_contracts sc
      JOIN supplier_users su ON sc.supplier_id = su.id
      WHERE sc.status = 'active'
        AND sc.expiry_date IS NOT NULL
        AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY sc.expiry_date ASC
    `);

    securityLogger.logEvent({
      type: 'admin_action',
      userId: auth.session.user.id,
      ip,
      path: '/api/admin/contracts/expiring-soon',
      method: 'GET',
      details: { count: contracts.length },
      severity: 'low',
    });

    return NextResponse.json({ contracts });
  } catch (error) {
    securityLogger.logError('Failed to fetch expiring contracts', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
