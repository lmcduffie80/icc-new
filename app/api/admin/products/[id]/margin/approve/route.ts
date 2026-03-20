import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { marginApprovalSchema } from '@/lib/validation';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendMarginApprovalEmail, sendMarginRejectionEmail } from '@/lib/supplier-emails';

interface ProductMarginData {
  id: string;
  name: string;
  price: string;
  supplier_price: string;
  margin_split_percentage: string;
  margin_approval_status: string;
  approval_status: string;
  supplier_id: string;
  supplier_email: string;
  supplier_name: string;
}

// POST /api/admin/products/[id]/margin/approve - Approve or reject margin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check permission
  if (!session.permissions.includes('products.approve_margin')) {
    return NextResponse.json(
      { error: 'You do not have permission to approve margins' },
      { status: 403 }
    );
  }

  const adminId = session.adminUser.id;
  const ip = getClientIp(request);
  const { id: productId } = await params;

  try {
    const body = await request.json();

    // Validate input
    const validationResult = marginApprovalSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/products/${productId}/margin/approve`,
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
        p.id, p.name, p.price, p.supplier_price, p.margin_split_percentage,
        p.margin_approval_status, p.approval_status, p.supplier_id,
        su.email as supplier_email, su.name as supplier_name
      FROM products p
      LEFT JOIN supplier_users su ON su.id = p.supplier_id
      WHERE p.id = $1`,
      [productId]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (product.margin_split_percentage === null) {
      return NextResponse.json(
        { error: 'Product does not have a margin split set' },
        { status: 400 }
      );
    }

    if (product.margin_approval_status !== 'pending') {
      return NextResponse.json(
        { error: `Margin has already been ${product.margin_approval_status}` },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      // Approve the margin
      await query(
        `UPDATE products
         SET margin_approval_status = 'approved',
             margin_approved_by = $1,
             margin_approved_at = NOW(),
             margin_approval_notes = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [adminId, notes || null, productId]
      );

      // Record in history
      await query(
        `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
         VALUES ($1, 'approved', $2, 'admin', $3, $4)`,
        [productId, adminId, product.margin_split_percentage, notes || 'Margin approved']
      );

      // Check if product is also approved - if so, publish it
      // Product statuses that indicate admin has approved the product itself
      const productApproved = ['admin_approved', 'supplier_approved'].includes(product.approval_status);

      if (productApproved) {
        // Both product and margin approved - publish the product
        await query(
          `UPDATE products
           SET approval_status = 'published',
               updated_at = NOW()
           WHERE id = $1`,
          [productId]
        );

        // Record product status change in approval history
        await query(
          `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
           VALUES ($1, 'published', $2, 'Product published after margin approval')`,
          [productId, adminId]
        );
      }

      // Calculate margin values for email
      const storePrice = parseFloat(product.price) || 0;
      const supplierPrice = parseFloat(product.supplier_price) || 0;
      const marginAmount = storePrice - supplierPrice;
      const marginPercentage = parseFloat(product.margin_split_percentage) || 0;
      const platformShare = marginAmount * (marginPercentage / 100);
      const supplierShare = marginAmount - platformShare;

      // Send margin approval email to supplier
      if (product.supplier_email) {
        await sendMarginApprovalEmail({
          to: product.supplier_email,
          supplierName: product.supplier_name || 'Supplier',
          productName: product.name,
          marginPercentage,
          marginAmount,
          platformShare,
          supplierShare,
          productUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${productId}`,
          notes: notes || undefined,
        });
      }

      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: `/api/admin/products/${productId}/margin/approve`,
        method: 'POST',
        details: {
          action: 'margin_approved',
          admin_id: adminId,
          product_id: productId,
          product_name: product.name,
          margin_percentage: product.margin_split_percentage,
          product_published: productApproved,
        },
        severity: 'low',
      });

      return NextResponse.json({
        success: true,
        message: productApproved
          ? 'Margin approved and product published'
          : 'Margin approved. Product will be published once product approval is complete.',
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
         SET margin_approval_status = 'rejected',
             margin_approval_notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [notes, productId]
      );

      // Record in history
      await query(
        `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
         VALUES ($1, 'rejected', $2, 'admin', $3, $4)`,
        [productId, adminId, product.margin_split_percentage, notes]
      );

      // Send margin rejection email to supplier
      if (product.supplier_email) {
        await sendMarginRejectionEmail({
          to: product.supplier_email,
          supplierName: product.supplier_name || 'Supplier',
          productName: product.name,
          marginPercentage: parseFloat(product.margin_split_percentage) || 0,
          notes,
          updateUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${productId}`,
        });
      }

      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: `/api/admin/products/${productId}/margin/approve`,
        method: 'POST',
        details: {
          action: 'margin_rejected',
          admin_id: adminId,
          product_id: productId,
          product_name: product.name,
          margin_percentage: product.margin_split_percentage,
          rejection_reason: notes,
        },
        severity: 'low',
      });

      return NextResponse.json({
        success: true,
        message: 'Margin rejected. Supplier has been notified.',
      });
    }
  } catch (error) {
    securityLogger.logError('Failed to process margin approval', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
