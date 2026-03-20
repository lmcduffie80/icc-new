import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

// POST /api/admin/products/[id]/deletion/reject - Reject product deletion request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('products.delete');
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    const body = await request.json().catch(() => ({}));
    const { reason } = body;

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

    // Clear the deletion request
    await queryOne(
      `UPDATE products 
       SET deletion_requested_at = NULL, updated_at = NOW()
       WHERE id = $1 
       RETURNING id`,
      [id]
    );

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'product',
      resourceId: id,
      before: {
        deletion_requested_at: product.deletion_requested_at,
        deletion_requested_by: product.supplier_id,
      },
      after: {
        deletion_requested_at: null,
        deletion_request_rejected: true,
        rejection_reason: reason || 'No reason provided',
      },
    });

    // Send notification email to supplier if they have an email
    if (product.supplier_email) {
      try {
        const { sendProductDeletionRejectionNotification } = await import('@/lib/email');
        await sendProductDeletionRejectionNotification({
          productName: product.name,
          productId: id,
          supplierEmail: product.supplier_email,
          supplierName: product.supplier_name || 'Supplier',
          reason: reason || 'No reason provided',
          ip,
        });
      } catch (emailError) {
        console.error('Failed to send deletion rejection notification to supplier:', emailError);
        // Don't fail the rejection if email fails
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Product deletion request rejected. Product remains in the store.'
    });
  } catch (error) {
    console.error('Error rejecting product deletion:', error);
    return NextResponse.json({ error: 'Failed to reject product deletion' }, { status: 500 });
  }
}

