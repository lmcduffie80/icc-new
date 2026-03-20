import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { checkRateLimit, rateLimiters, getClientIp, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { queryOne } from '@/lib/db';

// GET: Get contract details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/supplier/contracts/[id]', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Check supplier auth
  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    const contract = await queryOne(`
      SELECT 
        sc.*,
        au.name as admin_signed_by_name
      FROM supplier_contracts sc
      LEFT JOIN admin_users au ON sc.admin_signed_by = au.id
      WHERE sc.id = $1 AND sc.supplier_id = $2
    `, [id, session.user.id]);

    if (!contract) {
      // Log unauthorized access attempt
      securityLogger.logEvent({
        type: 'suspicious_activity',
        userId: session.user.id,
        ip,
        path: '/api/supplier/contracts/[id]',
        method: 'GET',
        details: { contractId: id, reason: 'Contract not found or unauthorized' },
        severity: 'medium',
      });
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json({ contract });
  } catch (error) {
    console.error('Error fetching contract:', error);
    securityLogger.logError('Failed to fetch contract', error, ip);
    return NextResponse.json({ error: 'Failed to fetch contract' }, { status: 500 });
  }
}
