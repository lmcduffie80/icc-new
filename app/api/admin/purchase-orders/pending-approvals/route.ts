import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/admin/purchase-orders/pending-approvals - Get all pending approval requests
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  try {
    const pendingApprovals = await query<{
      id: number;
      purchase_order_id: number;
      po_number: string;
      vendor_name: string;
      buyer_name: string;
      total_amount: number;
      requested_by: string | null;
      requested_at: string;
      status: string;
    }>(
      `SELECT 
        ar.id,
        ar.purchase_order_id,
        po.po_number,
        v.name as vendor_name,
        po.buyer_name,
        po.total_amount,
        ar.requested_by,
        ar.requested_at,
        ar.status
      FROM po_approval_requests ar
      JOIN purchase_orders po ON po.id = ar.purchase_order_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE ar.status = 'PENDING'
      ORDER BY ar.requested_at DESC`
    );

    return NextResponse.json(pendingApprovals);
  } catch (error) {
    securityLogger.logError('Failed to fetch pending approvals', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

