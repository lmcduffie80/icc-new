import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// POST /api/supplier/products/:id/approve-label - Approve admin-modified label
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
       WHERE token = $1 AND product_id = $2 AND supplier_id = $3 AND action = 'approve'
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
      admin_label_url: string | null;
    }>(
      `SELECT id, supplier_id, approval_status, admin_label_url
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

    if (!product.admin_label_url) {
      return NextResponse.json(
        { error: 'Admin label URL not found' },
        { status: 400 }
      );
    }

    // Update product to published status
    // Sync ICC Qty to inventory_count when publishing
    await query(
      `UPDATE products
       SET approval_status = 'published',
           inventory_count = COALESCE(icc_available_quantity, inventory_count),
           in_stock = COALESCE(icc_available_quantity, inventory_count) > 0,
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

    // Record approval history
    await query(
      `INSERT INTO product_approval_history (product_id, action, performed_by, notes, label_url)
       VALUES ($1, 'supplier_approved_label', $2, 'Supplier approved admin-modified label', $3)`,
      [id, supplierId, product.admin_label_url]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/products/${id}/approve-label`,
      method: 'POST',
      details: {
        action: 'label_approved',
        supplier_id: supplierId,
        product_id: id,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      message: 'Label approved. Product is now published.',
    });
  } catch (error) {
    securityLogger.logError('Failed to approve label', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

