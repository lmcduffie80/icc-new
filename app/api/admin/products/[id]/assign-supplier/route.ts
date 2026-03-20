import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const assignSupplierSchema = z.object({
  supplier_id: z.string().uuid(),
});

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/admin/products/[id]/assign-supplier
 * Assigns a product to a supplier for pricing, inventory, and document management
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { id: productId } = await params;
  const ip = getClientIp(request);

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    // Parse and validate request body
    const body = await request.json();
    const result = assignSupplierSchema.safeParse(body);

    if (!result.success) {
      securityLogger.logValidationFailure(
        `/api/admin/products/${productId}/assign-supplier`,
        ip,
        result.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const { supplier_id } = result.data;

    // Verify product exists
    const product = await queryOne<{
      id: string;
      name: string;
      supplier_id: string | null;
      approval_status: string | null;
    }>(
      'SELECT id, name, supplier_id, approval_status FROM products WHERE id = $1 AND deleted_at IS NULL',
      [productId]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Verify supplier exists and is active
    const supplier = await queryOne<{
      id: string;
      company_name: string;
      email: string;
      is_active: boolean;
    }>(
      'SELECT id, company_name, email, is_active FROM supplier_users WHERE id = $1',
      [supplier_id]
    );

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    if (!supplier.is_active) {
      return NextResponse.json(
        { error: 'Supplier is not active' },
        { status: 400 }
      );
    }

    // Update product with supplier assignment
    const updatedProduct = await queryOne<{
      id: string;
      name: string;
      supplier_id: string;
      supplier_review_status: string;
      assigned_to_supplier_at: string;
    }>(
      `UPDATE products
       SET 
         supplier_id = $1,
         supplier_review_status = 'pending_supplier_review',
         assigned_to_supplier_at = NOW(),
         updated_at = NOW()
       WHERE id = $2
       RETURNING 
         id, 
         name, 
         supplier_id, 
         supplier_review_status, 
         assigned_to_supplier_at`,
      [supplier_id, productId]
    );

    // Log in product approval history
    await query(
      `INSERT INTO product_approval_history (
        product_id,
        action,
        performed_by,
        notes
      ) VALUES ($1, 'assigned_to_supplier', $2, $3)`,
      [
        productId,
        authResult.session!.admin_user_id,
        'Assigned to supplier: ' + supplier.company_name
      ]
    );

    // Log security event
    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/products/${productId}/assign-supplier`,
      method: 'POST',
      details: {
        action: 'assign_product_to_supplier',
        adminUserId: authResult.session!.admin_user_id,
        adminEmail: authResult.session!.admin_email,
        productId,
        productName: product.name,
        supplierId: supplier_id,
        supplierName: supplier.company_name,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: `Product assigned to ${supplier.company_name}`,
    });
  } catch (error) {
    console.error('Error assigning product to supplier:', error);
    securityLogger.logError('Failed to assign product to supplier', error, ip);
    return NextResponse.json(
      { error: 'Failed to assign product to supplier' },
      { status: 500 }
    );
  }
}
