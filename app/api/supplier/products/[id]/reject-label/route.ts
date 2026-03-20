import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// POST /api/supplier/products/:id/reject-label - Reject admin-modified label
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const { id } = await params;
  const supplierId = authResult.session.user.id;
  const ip = getClientIp(request);

  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify token
    const tokenRecord = await queryOne<{
      id: string;
      product_id: string;
      supplier_id: string;
      action: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT * FROM label_approval_tokens
       WHERE token = $1 AND product_id = $2 AND supplier_id = $3 AND action = 'reject'
       AND expires_at > NOW() AND used_at IS NULL`,
      [token, id, supplierId]
    );

    if (!tokenRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    // Verify product belongs to supplier
    const product = await queryOne<{
      id: string;
      supplier_id: string;
      approval_status: string;
    }>(
      `SELECT id, supplier_id, approval_status
       FROM products
       WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL`,
      [id, supplierId]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (product.approval_status !== 'label_pending_supplier_approval') {
      return NextResponse.json(
        { error: 'Product is not pending label approval' },
        { status: 400 }
      );
    }

    // Update product back to pending status
    await query(
      `UPDATE products
       SET approval_status = 'pending',
           admin_label_url = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Mark token as used
    await query(
      `UPDATE label_approval_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRecord.id]
    );

    // Record rejection history
    await query(
      `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
       VALUES ($1, 'supplier_rejected_label', $2, 'Supplier rejected admin-modified label')`,
      [id, supplierId]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/products/${id}/reject-label`,
      method: 'POST',
      details: {
        action: 'label_rejected',
        supplier_id: supplierId,
        product_id: id,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      message: 'Label rejected. Product returned to pending status. Please upload a new label.',
    });
  } catch (error) {
    securityLogger.logError('Failed to reject label', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

