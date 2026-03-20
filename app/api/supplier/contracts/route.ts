import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { checkRateLimit, rateLimiters, getClientIp, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query } from '@/lib/db';

// GET: List contracts for logged-in supplier
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/supplier/contracts', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Check supplier auth
  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const contractType = searchParams.get('contractType');

    const includeSuperseded = searchParams.get('includeSuperseded') === 'true';

    // Build query with filters
    let queryText = `
      SELECT 
        sc.*,
        au.name as admin_signed_by_name,
        su.name as supplier_signed_by_name
      FROM supplier_contracts sc
      LEFT JOIN admin_users au ON sc.admin_signed_by = au.id
      LEFT JOIN supplier_users su ON sc.supplier_signed_by = su.id
      WHERE sc.supplier_id = $1
    `;

    const params: unknown[] = [session.user.id];
    let paramIndex = 2;

    // By default hide superseded contracts from supplier view
    if (!includeSuperseded && !status) {
      queryText += ` AND sc.status != 'superseded'`;
    }

    if (status) {
      queryText += ` AND sc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (contractType) {
      queryText += ` AND sc.contract_type = $${paramIndex}`;
      params.push(contractType);
      paramIndex++;
    }

    queryText += ` ORDER BY sc.created_at DESC`;

    const result = await query(queryText, params);

    return NextResponse.json({ contracts: result });
  } catch (error) {
    console.error('Error fetching supplier contracts:', error);
    securityLogger.logError('Failed to fetch supplier contracts', error, ip);
    return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
  }
}
