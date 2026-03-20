import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getSupplierSession } from '@/lib/supplier-auth';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/supplier/products/[id]/submit
 * Supplier submits completed product for admin approval
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { id: productId } = await params;
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/supplier/products/${productId}/submit`, 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify supplier session
  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Fetch product and verify ownership
    const productData = await queryOne<{
      id: string;
      name: string;
      supplier_id: string;
      supplier_review_status: string | null;
      supplier_price: string | null;
      icc_available_quantity: number | null;
      sds_url: string | null;
      label_url: string | null;
      supplier_pricing_completed: boolean | null;
      supplier_inventory_completed: boolean | null;
      supplier_documents_completed: boolean | null;
    }>(
      `SELECT 
        id,
        name,
        supplier_id,
        supplier_review_status,
        supplier_price,
        icc_available_quantity,
        sds_url,
        label_url,
        supplier_pricing_completed,
        supplier_inventory_completed,
        supplier_documents_completed
      FROM products
      WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL`,
      [productId, session.user.id]
    );

    if (!productData) {
      return NextResponse.json(
        { error: 'Product not found or access denied' },
        { status: 404 }
      );
    }

    // Verify product is in correct status
    if (productData.supplier_review_status !== 'supplier_in_progress' && 
        productData.supplier_review_status !== 'pending_supplier_review') {
      return NextResponse.json(
        { 
          error: 'Product cannot be submitted',
          details: `Current status: ${productData.supplier_review_status}`
        },
        { status: 400 }
      );
    }

    // Check if required sections are completed
    const errors: string[] = [];
    
    if (!productData.supplier_price || parseFloat(productData.supplier_price) <= 0) {
      errors.push('Supplier price is required');
    }
    
    if (productData.icc_available_quantity === null || productData.icc_available_quantity < 0) {
      errors.push('Available quantity is required');
    }
    
    if (!productData.sds_url && !productData.label_url) {
      errors.push('At least one document (SDS or label) is required');
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { 
          error: 'Product submission incomplete',
          details: errors,
        },
        { status: 400 }
      );
    }

    // Update product status to submitted
    const updatedProduct = await queryOne<{
      id: string;
      name: string;
      supplier_review_status: string;
      updated_at: string;
    }>(
      `UPDATE products
       SET 
         supplier_review_status = 'supplier_submitted',
         supplier_pricing_completed = true,
         supplier_inventory_completed = true,
         supplier_documents_completed = true,
         updated_at = NOW()
       WHERE id = $1
       RETURNING 
         id,
         name,
         supplier_review_status,
         updated_at`,
      [productId]
    );

    // Log in product approval history
    await query(
      `INSERT INTO product_approval_history (
        product_id,
        action,
        performed_by,
        notes
      ) VALUES ($1, 'supplier_submitted', $2, 'Supplier completed review and submitted product for approval')`,
      [productId, session.user.id]
    );

    // Log security event
    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/supplier/products/${productId}/submit`,
      method: 'POST',
      details: {
        action: 'supplier_product_submitted',
        supplierId: session.user.id,
        supplierEmail: session.user.email,
        productId,
        productName: productData.name,
      },
      severity: 'low',
    });

    // TODO: Send email notification to admin
    // This will be implemented in the email_notifications todo
    console.log(`TODO: Send email to admin about product submission: ${productData.name}`);

    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: 'Product submitted successfully for admin approval',
    });
  } catch (error) {
    console.error('Error submitting product:', error);
    securityLogger.logError('Failed to submit product', error, ip);
    return NextResponse.json(
      { error: 'Failed to submit product' },
      { status: 500 }
    );
  }
}
