import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { adminMarginProposalSchema } from '@/lib/validation';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendAdminMarginProposalEmail } from '@/lib/supplier-emails';

interface ProductData {
  id: string;
  name: string;
  price: string;
  supplier_price: string;
  supplier_id: string;
  supplier_email: string;
  supplier_name: string;
  approval_status: string;
}

// POST /api/admin/products/[id]/margin/propose - Admin proposes a new margin
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
  if (!session.permissions.includes('products.approve_margin') && 
      !session.permissions.includes('products.update')) {
    return NextResponse.json(
      { error: 'You do not have permission to propose margins' },
      { status: 403 }
    );
  }

  const adminId = session.adminUser.id;
  const adminName = session.adminUser.name || 'Admin';
  const ip = getClientIp(request);
  const { id: productId } = await params;

  try {
    const body = await request.json();

    // Validate input
    const validationResult = adminMarginProposalSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/products/${productId}/margin/propose`,
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { margin_percent, notes } = validationResult.data;

    // Get product with supplier data
    const product = await queryOne<ProductData>(
      `SELECT
        p.id, p.name, p.price, p.supplier_price, p.supplier_id, p.approval_status,
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

    if (!product.supplier_id) {
      return NextResponse.json(
        { error: 'Product does not have a supplier' },
        { status: 400 }
      );
    }

    // Update product with admin's proposed margin
    await query(
      `UPDATE products
       SET admin_proposed_margin_percent = $1,
           admin_proposed_margin_at = NOW(),
           admin_proposed_margin_by = $2,
           margin_proposal_source = 'admin',
           supplier_margin_approval_status = 'pending',
           approval_status = 'pending',
           updated_at = NOW()
       WHERE id = $3`,
      [margin_percent, adminId, productId]
    );

    // Record in history
    await query(
      `INSERT INTO margin_approval_history (product_id, action, performed_by, performer_type, margin_split_percentage, notes)
       VALUES ($1, 'admin_proposed', $2, 'admin', $3, $4)`,
      [productId, adminId, margin_percent, notes || `Admin proposed ${margin_percent}% margin`]
    );

    // Calculate margin breakdown for email
    const storePrice = parseFloat(product.price) || 0;
    const supplierPrice = parseFloat(product.supplier_price) || 0;
    const marginAmount = storePrice - supplierPrice;
    const platformShare = marginAmount * (margin_percent / 100);
    const supplierKeeps = marginAmount - platformShare;

    // Send email to supplier for approval
    if (product.supplier_email) {
      await sendAdminMarginProposalEmail({
        to: product.supplier_email,
        supplierName: product.supplier_name || 'Supplier',
        productName: product.name,
        proposedMarginPercent: margin_percent,
        marginBreakdown: {
          storePrice,
          supplierPrice,
          margin: marginAmount,
          platformShare,
          supplierKeeps,
        },
        approvalUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${productId}/approve-margin`,
        proposedByAdmin: adminName,
        notes: notes || undefined,
      });
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/products/${productId}/margin/propose`,
      method: 'POST',
      details: {
        action: 'admin_proposed_margin',
        admin_id: adminId,
        admin_name: adminName,
        product_id: productId,
        product_name: product.name,
        margin_percent,
        supplier_id: product.supplier_id,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      message: 'Margin proposal sent to supplier for approval. Product status set to pending.',
    });
  } catch (error) {
    securityLogger.logError('Failed to propose margin', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
