import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';

const approvePOSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejection_reason: z.string().max(500).trim().optional().nullable(),
});

// POST /api/admin/purchase-orders/[id]/approve - Approve or reject a purchase order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);
  const { id } = await params;
  
  // Clean ID (handle cases like "1:1")
  const cleanId = id.split(':')[0].trim();
  const poId = parseInt(cleanId, 10);
  if (isNaN(poId) || poId <= 0) {
    return NextResponse.json({ error: 'Invalid purchase order ID', received: id }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validationResult = approvePOSchema.safeParse(body);
    
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/purchase-orders/${poId}/approve`,
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { action, rejection_reason } = validationResult.data;

    // Check if PO exists and get current status
    const po = await queryOne<{
      id: number;
      po_number: string;
      status: string;
    }>(
      'SELECT id, po_number, status FROM purchase_orders WHERE id = $1',
      [poId]
    );

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    // Check if there's a pending approval request
    const approvalRequest = await queryOne<{
      id: number;
      status: string;
    }>(
      'SELECT id, status FROM po_approval_requests WHERE purchase_order_id = $1 AND status = $2',
      [poId, 'PENDING']
    );

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'No pending approval request found for this purchase order' },
        { status: 400 }
      );
    }

    // Update approval request
    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await query(
      `UPDATE po_approval_requests 
       SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4`,
      [newStatus, authResult.session!.admin_user_id, rejection_reason || null, approvalRequest.id]
    );

    // The trigger will automatically update the PO status
    // But let's verify it was updated
    const updatedPO = await queryOne<{
      id: number;
      po_number: string;
      status: string;
    }>(
      'SELECT id, po_number, status FROM purchase_orders WHERE id = $1',
      [poId]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/purchase-orders/${poId}/approve`,
      method: 'POST',
      details: {
        poId: poId,
        poNumber: po.po_number,
        action: action,
        oldStatus: po.status,
        newStatus: updatedPO?.status,
        approvedBy: authResult.session!.admin_name,
      },
      severity: 'medium',
    });

    return NextResponse.json({
      success: true,
      message: action === 'APPROVE' 
        ? 'Purchase order approved successfully' 
        : 'Purchase order rejected successfully',
      purchaseOrder: {
        id: updatedPO?.id,
        po_number: updatedPO?.po_number,
        status: updatedPO?.status,
      },
    });
  } catch (error) {
    securityLogger.logError('Failed to process PO approval', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/admin/purchase-orders/[id]/approve - Get approval status for a PO
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);
  const { id } = await params;
  
  // Clean ID
  const cleanId = id.split(':')[0].trim();
  const poId = parseInt(cleanId, 10);
  if (isNaN(poId) || poId <= 0) {
    return NextResponse.json({ error: 'Invalid purchase order ID', received: id }, { status: 400 });
  }

  try {
    const approvalRequest = await queryOne<{
      id: number;
      purchase_order_id: number;
      requested_by: string | null;
      requested_at: string;
      status: string;
      approved_by: string | null;
      approved_at: string | null;
      rejection_reason: string | null;
    }>(
      `SELECT id, purchase_order_id, requested_by, requested_at, status, 
              approved_by, approved_at, rejection_reason
       FROM po_approval_requests
       WHERE purchase_order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [poId]
    );

    if (!approvalRequest) {
      return NextResponse.json({ error: 'No approval request found' }, { status: 404 });
    }

    return NextResponse.json(approvalRequest);
  } catch (error) {
    securityLogger.logError('Failed to fetch PO approval status', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

