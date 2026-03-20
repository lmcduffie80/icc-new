import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

// POST /api/admin/products/[id]/deletion/approve - Approve product deletion request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.delete');
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    // Get the product with supplier info
    const product = await queryOne<{
      id: string;
      name: string;
      supplier_id: string | null;
      deletion_requested_at: string | null;
      supplier_name: string | null;
      supplier_email: string | null;
    }>(
      `SELECT p.id, p.name, p.supplier_id, p.deletion_requested_at,
              su.name as supplier_name, su.email as supplier_email
       FROM products p
       LEFT JOIN supplier_users su ON su.id = p.supplier_id
       WHERE p.id = $1`,
      [id]
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!product.deletion_requested_at) {
      return NextResponse.json(
        { error: 'No deletion request found for this product' },
        { status: 400 }
      );
    }

    // Get product details for audit log before deletion
    const productDetails = await queryOne(
      `SELECT id, name, category, price, approval_status, supplier_id
       FROM products
       WHERE id = $1`,
      [id]
    );

    // Delete related warehouse entries first
    await query(
      `DELETE FROM product_warehouses WHERE product_id = $1`,
      [id]
    );

    // Delete the product
    await queryOne('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'product',
      resourceId: id,
      before: {
        ...(productDetails as unknown as Record<string, unknown>),
        deletion_requested_by: product.supplier_id,
        deletion_requested_at: product.deletion_requested_at,
      },
      after: {
        deleted: true,
        deleted_by: auth.session.adminUser.id,
        deleted_at: new Date().toISOString(),
      },
    });

    // Send notification email to supplier if they have an email
    if (product.supplier_email) {
      try {
        const { sendProductDeletionApprovalNotification } = await import('@/lib/email');
        await sendProductDeletionApprovalNotification({
          productName: product.name,
          supplierEmail: product.supplier_email,
          supplierName: product.supplier_name || 'Supplier',
          ip,
        });
      } catch (emailError) {
        console.error('Failed to send deletion approval notification to supplier:', emailError);
        // Don't fail the deletion if email fails
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Product deletion approved and product has been removed from the store.'
    });
  } catch (error) {
    console.error('Error approving product deletion:', error);
    return NextResponse.json({ error: 'Failed to approve product deletion' }, { status: 500 });
  }
}

