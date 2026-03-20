import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/admin/products/margin-approvals/pending-count - Get count of pending margin approvals
export async function GET(request: NextRequest) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ pendingCount: 0 });
  }

  // Check permission - return 0 if user doesn't have permission
  if (!session.permissions.includes('products.approve_margin')) {
    return NextResponse.json({ pendingCount: 0 });
  }

  const ip = getClientIp(request);

  try {
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM products
       WHERE supplier_id IS NOT NULL
         AND margin_approval_status = 'pending'
         AND margin_split_percentage IS NOT NULL`
    );

    const pendingCount = parseInt(result?.count || '0', 10);

    return NextResponse.json({ pendingCount });
  } catch (error) {
    securityLogger.logError('Failed to fetch margin pending count', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
