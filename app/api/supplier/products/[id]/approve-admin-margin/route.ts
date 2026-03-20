import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { supplierMarginDecisionSchema } from '@/lib/validation';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendSupplierMarginDecisionEmail } from '@/lib/supplier-emails';

interface ProductMarginData {
  id: string;
  name: string;
  price: string;
  supplier_price: string;
  admin_proposed_margin_percent: string;
  supplier_margin_approval_status: string;
  supplier_id: string;
  approval_status: string;
  admin_proposed_margin_by: string;
  supplier_name: string;
}

interface AdminData {
  id: string;
  name: string;
  email: string;
}

// POST /api/supplier/products/[id]/approve-admin-margin - Supplier approves or rejects admin's proposed margin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSupplierSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supplierId = session.user.id;
  const supplierName = session.user.name || 'Supplier';
  const ip = getClientIp(request);
  const { id: productId } = await params;

  try {
    const body = await request.json();

    // Validate input
    const validationResult = supplierMarginDecisionSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/supplier/products/${productId}/approve-admin-margin`,
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { action, notes } = validationResult.data;

    // Get product with margin data
    const product = await queryOne<ProductMarginData>(
      `SELECT
        p.id, p.name, p.price, p.supplier_price, p.admin_proposed_margin_percent,
        p.supplier_margin_approval_status, p.supplier_id, p.approval_status,
        p.admin_proposed_margin_by, su.name as supplier_name
      FROM products p
      LEFT JOIN supplier_users su ON su.id = p.supplier_id
      WHERE p.id = $1 AND p.supplier_id = $2 AND p.deleted_at IS NULL`,
      [productId, supplierId]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found or does not belong to your account' },
        { status: 404 }
      );
    }

    if (!product.admin_proposed_margin_percent) {
      return NextResponse.json(
        { error: 'No admin margin proposal found for this product' },
        { status: 400 }
      );
    }

    if (product.supplier_margin_approval_status !== 'pending') {
      return NextResponse.json(
        { error: `Margin has already been ${product.supplier_margin_approval_status}` },
        { status: 400 }
      );
    }

    // Get admin info for email notification
    const admin = await queryOne<AdminData>(
      `SELECT id, name, email FROM admin_users WHERE id = $1`,
      [product.admin_proposed_margin_by]
    );

    if (action === 'approve') {
      // Approve the margin - copy admin's proposal to the main margin field
      await query(
        `UPDATE products
         SET margin_split_percentage = admin_proposed_margin_percent,
             supplier_margin_approval_status = 'approved',
             supplier_margin_approved_at = NOW(),
             margin_approval_status = 'approved',
             supplier_margin_approval_notes = $1,
             approval_status = 'published',
             updated_at = NOW()
         WHERE id = $2`,
        [notes || 'Approved admin margin proposal', productId]
      );

      // Record in history
      await query(
        `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
         VALUES ($1, 'supplier_approved_admin_margin', $2, 'supplier', $3, $4)`,
        [productId, supplierId, product.admin_proposed_margin_percent, notes || 'Supplier approved admin margin proposal']
      );

      // Record product status change in approval history
      await query(
        `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
         VALUES ($1, 'published', $2, 'Product published after supplier approved admin margin')`,
        [productId, supplierId]
      );

      // Send email to admin
      if (admin?.email) {
        await sendSupplierMarginDecisionEmail({
          to: admin.email,
          adminName: admin.name || 'Admin',
          productName: product.name,
          decision: 'approved',
          marginPercent: parseFloat(product.admin_proposed_margin_percent),
          supplierName,
          supplierNotes: notes,
          productUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/products/${productId}`,
        });
      }

      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: `/api/supplier/products/${productId}/approve-admin-margin`,
        method: 'POST',
        details: {
          action: 'supplier_approved_admin_margin',
          supplier_id: supplierId,
          supplier_name: supplierName,
          product_id: productId,
          product_name: product.name,
          margin_percent: product.admin_proposed_margin_percent,
        },
        severity: 'low',
      });

      return NextResponse.json({
        success: true,
        message: 'Margin approved and product published',
      });
    } else {
      // Reject the margin
      if (!notes || !notes.trim()) {
        return NextResponse.json(
          { error: 'Notes are required when rejecting a margin' },
          { status: 400 }
        );
      }

      await query(
        `UPDATE products
         SET supplier_margin_approval_status = 'rejected',
             supplier_margin_approval_notes = $1,
             supplier_margin_approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [notes, productId]
      );

      // Record in history
      await query(
        `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
         VALUES ($1, 'supplier_rejected_admin_margin', $2, 'supplier', $3, $4)`,
        [productId, supplierId, product.admin_proposed_margin_percent, notes]
      );

      // Send email to admin
      if (admin?.email) {
        await sendSupplierMarginDecisionEmail({
          to: admin.email,
          adminName: admin.name || 'Admin',
          productName: product.name,
          decision: 'rejected',
          marginPercent: parseFloat(product.admin_proposed_margin_percent),
          supplierName,
          supplierNotes: notes,
          productUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/products/${productId}`,
        });
      }

      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: `/api/supplier/products/${productId}/approve-admin-margin`,
        method: 'POST',
        details: {
          action: 'supplier_rejected_admin_margin',
          supplier_id: supplierId,
          supplier_name: supplierName,
          product_id: productId,
          product_name: product.name,
          margin_percent: product.admin_proposed_margin_percent,
          rejection_reason: notes,
        },
        severity: 'low',
      });

      return NextResponse.json({
        success: true,
        message: 'Margin rejected. Admin has been notified.',
      });
    }
  } catch (error) {
    securityLogger.logError('Failed to process supplier margin decision', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
