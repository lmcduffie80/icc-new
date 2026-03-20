import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendLabelModificationEmail, sendProductRejectionEmail } from '@/lib/supplier-emails';
import { randomBytes } from 'crypto';

console.log('[APPROVE MODULE] Route file loaded successfully');

interface Product {
  id: string;
  name: string;
  supplier_id: string | null;
  approval_status: string;
  label_url: string | null;
  admin_label_url: string | null;
  label_template_id: string | null;
  supplier_price: string | null;
  price: string;
  margin_split_percentage: string | null;
  margin_approval_status: string | null;
}

interface SupplierUser {
  id: string;
  email: string;
  company_name: string;
}

// POST /api/admin/products/[id]/approve - Approve a supplier product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireAdmin('products.update');
    console.log('[APPROVE] requireAdmin completed:', { hasError: !!auth.error });
  } catch (error) {
    console.error('[APPROVE] requireAdmin threw error:', error);
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
  
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);
  let action: string | undefined;

  try {
    const body = await request.json();
    action = body.action;
    const { admin_label_url, approval_notes } = body;
    console.log('[APPROVE] Request body:', { action, admin_label_url, approval_notes, productId: id });

    // Get product with supplier info and minimum_order_qty
    const product = await queryOne<Product & { minimum_order_qty: number | null }>(
      `SELECT p.id, p.name, p.supplier_id, p.approval_status, p.label_url, p.admin_label_url,
              p.label_template_id, p.supplier_price, p.price, p.minimum_order_qty,
              p.margin_split_percentage, p.margin_approval_status
       FROM products p
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );

    if (!product) {
      console.log('[APPROVE] Product not found:', id);
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    console.log('[APPROVE] Product found:', { id: product.id, name: product.name, supplier_id: product.supplier_id, label_template_id: product.label_template_id });

    if (!product.supplier_id) {
      return NextResponse.json(
        { error: 'This product is not a supplier product' },
        { status: 400 }
      );
    }

    // If product has a label_template_id, copy the template's label image to product.label_url
    if (product.label_template_id) {
      console.log('[APPROVE] Fetching template:', product.label_template_id);
      const template = await queryOne<{ label_image_url: string }>(
        `SELECT label_image_url FROM label_templates WHERE id = $1`,
        [product.label_template_id]
      );
      
      if (template) {
        console.log('[APPROVE] Template found, updating label_url:', template.label_image_url);
        await query(
          `UPDATE products SET label_url = $1, updated_at = NOW() WHERE id = $2`,
          [template.label_image_url, id]
        );
        // Update the product object for later use
        product.label_url = template.label_image_url;
      } else {
        console.log('[APPROVE] No template found for label_template_id:', product.label_template_id);
      }
    }

    if (action === 'approve') {
      console.log('[APPROVE] Action is approve, checking for admin_label_url:', !!admin_label_url);
      
      // Admin approves the product - move to admin_approved status
      if (admin_label_url) {
        console.log('[APPROVE] Admin modified label, updating product status');
        // Admin has modified the label - need supplier approval
        await query(
          `UPDATE products 
           SET approval_status = 'label_pending_supplier_approval',
               admin_label_url = $1,
               approval_notes = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [admin_label_url, approval_notes || null, id]
        );
        console.log('[APPROVE] Product status updated successfully');

        // Record approval history
        console.log('[APPROVE] Recording approval history');
        await query(
          `INSERT INTO product_approval_history (product_id, action, performed_by, notes, label_url)
           VALUES ($1, 'label_modified', 'admin', $2, $3)`,
          [id, approval_notes || 'Admin modified product label', admin_label_url]
        );
        console.log('[APPROVE] Approval history recorded successfully');

        // Get supplier info for email
        const supplier = await queryOne<SupplierUser>(
          `SELECT id, email, company_name FROM supplier_users WHERE id = $1`,
          [product.supplier_id]
        );

        if (supplier) {
          // Generate tokens for approval and rejection
          const approveToken = randomBytes(32).toString('hex');
          const rejectToken = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          // Insert both tokens
          await query(
            `INSERT INTO label_approval_tokens (product_id, supplier_id, token, action, expires_at)
             VALUES ($1, $2, $3, 'approve', $4)`,
            [id, product.supplier_id, approveToken, expiresAt.toISOString()]
          );
          
          await query(
            `INSERT INTO label_approval_tokens (product_id, supplier_id, token, action, expires_at)
             VALUES ($1, $2, $3, 'reject', $4)`,
            [id, product.supplier_id, rejectToken, expiresAt.toISOString()]
          );

          // Send email to supplier for label approval
          const approveUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${id}/approve-label?token=${approveToken}`;
          const rejectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${id}/reject-label?token=${rejectToken}`;

          const emailResult = await sendLabelModificationEmail({
            to: supplier.email,
            supplierName: supplier.company_name,
            productName: product.name,
            adminLabelUrl: admin_label_url,
            originalLabelUrl: product.label_url || '',
            approveUrl,
            rejectUrl,
            notes: approval_notes,
          });

          if (!emailResult.success) {
            console.warn('[APPROVE] Failed to send label modification email:', emailResult.error);
            console.warn('[APPROVE] Product approval will continue, but supplier was not notified via email');
          } else {
            console.log('[APPROVE] Label modification email sent successfully to:', supplier.email);
          }

        await logAction({
          adminUserId: auth.session.adminUser.id,
          action: 'status_change',
          resourceType: 'product',
          resourceId: id,
          after: { approval_status: 'label_pending_supplier_approval' } as unknown as Record<string, unknown>,
        });

          const responseMessage = emailResult.success
            ? 'Product approved. Label modification sent to supplier for approval.'
            : 'Product approved. Label modification saved (email notification failed - please notify supplier manually).';

          return NextResponse.json({
            success: true,
            message: responseMessage,
            status: 'label_pending_supplier_approval',
            needsMinimumOrderQty: product.minimum_order_qty === null || product.minimum_order_qty === undefined,
            emailSent: emailResult.success,
          });
        }
      } else {
        console.log('[APPROVE] No admin label modification, checking margin status');
        // No label modification - check if margin also needs approval
        const hasMargin = product.margin_split_percentage !== null;
        const marginApproved = product.margin_approval_status === 'approved';
        const canPublish = !hasMargin || marginApproved;
        console.log('[APPROVE] Margin check:', { hasMargin, marginApproved, canPublish });

        if (canPublish) {
          console.log('[APPROVE] Publishing product directly');
          // No margin set OR margin already approved - publish directly
          // Sync ICC Qty to inventory_count when publishing
          await query(
            `UPDATE products
             SET approval_status = 'published',
                 approval_notes = $1,
                 inventory_count = COALESCE(icc_available_quantity, inventory_count),
                 in_stock = COALESCE(icc_available_quantity, inventory_count) > 0,
                 updated_at = NOW()
             WHERE id = $2`,
            [approval_notes || null, id]
          );
          console.log('[APPROVE] Product status updated to published');

          await query(
            `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
             VALUES ($1, 'published', 'admin', $2)`,
            [id, approval_notes || 'Product approved and published by admin']
          );
          console.log('[APPROVE] Published approval history recorded');

          await logAction({
            adminUserId: auth.session.adminUser.id,
            action: 'publish',
            resourceType: 'product',
            resourceId: id,
            after: { approval_status: 'published' } as unknown as Record<string, unknown>,
          });

          return NextResponse.json({
            success: true,
            message: 'Product approved and published',
            status: 'published',
            needsMinimumOrderQty: product.minimum_order_qty === null || product.minimum_order_qty === undefined,
          });
        } else {
          console.log('[APPROVE] Margin pending, setting status to admin_approved');
          // Margin set but pending approval - approve product but don't publish yet
          await query(
            `UPDATE products
             SET approval_status = 'admin_approved',
                 approval_notes = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [approval_notes || null, id]
          );
          console.log('[APPROVE] Product status updated to admin_approved');

          await query(
            `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
             VALUES ($1, 'admin_approved', 'admin', $2)`,
            [id, approval_notes || 'Product approved by admin. Awaiting margin approval.']
          );
          console.log('[APPROVE] Admin approved history recorded');

          await logAction({
            adminUserId: auth.session.adminUser.id,
            action: 'status_change',
            resourceType: 'product',
            resourceId: id,
            after: { approval_status: 'admin_approved' } as unknown as Record<string, unknown>,
          });

          return NextResponse.json({
            success: true,
            message: 'Product approved. Awaiting margin approval before publishing.',
            status: 'admin_approved',
            needsMinimumOrderQty: product.minimum_order_qty === null || product.minimum_order_qty === undefined,
            marginPending: true,
          });
        }
      }
    } else if (action === 'reject') {
      console.log('[APPROVE] Action is reject, updating product status');
      // Reject the product
      await query(
        `UPDATE products 
         SET approval_status = 'rejected',
             approval_notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [approval_notes || null, id]
      );
      console.log('[APPROVE] Product status updated to rejected');

      await query(
        `INSERT INTO product_approval_history (product_id, action, performed_by, notes)
         VALUES ($1, 'rejected', 'admin', $2)`,
        [id, approval_notes || 'Product rejected by admin']
      );
      console.log('[APPROVE] Rejection history recorded');

      // Get supplier info for email
      const supplier = await queryOne<SupplierUser>(
        `SELECT id, email, company_name FROM supplier_users WHERE id = $1`,
        [product.supplier_id]
      );

      let emailSent = false;
      if (supplier) {
        // Send rejection email to supplier
        const productUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${id}`;
        const emailResult = await sendProductRejectionEmail({
          to: supplier.email,
          supplierName: supplier.company_name,
          productName: product.name,
          productUrl,
          notes: approval_notes,
        });

        if (!emailResult.success) {
          console.warn('[APPROVE] Failed to send rejection email:', emailResult.error);
          console.warn('[APPROVE] Product rejection will continue, but supplier was not notified via email');
        } else {
          console.log('[APPROVE] Rejection email sent successfully to:', supplier.email);
          emailSent = true;
        }
      }

      await logAction({
        adminUserId: auth.session.adminUser.id,
        action: 'status_change',
        resourceType: 'product',
        resourceId: id,
        after: { approval_status: 'rejected' } as unknown as Record<string, unknown>,
      });

      const responseMessage = emailSent
        ? 'Product rejected'
        : 'Product rejected (email notification failed - please notify supplier manually)';

      return NextResponse.json({
        success: true,
        message: responseMessage,
        status: 'rejected',
        emailSent,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }
  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      productId: id,
      action: action,
      code: (error as { code?: string }).code,
      detail: (error as { detail?: string }).detail,
    };
    console.error('[APPROVE] Detailed error:', JSON.stringify(errorDetails, null, 2));
    securityLogger.logError('Failed to approve/reject product', error, ip);
    
    // Return more specific error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    );
  }
}

