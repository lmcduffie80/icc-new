import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';

// Force Node.js runtime
export const runtime = 'nodejs';

// POST: Approve label template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/admin/label-templates/${id}/approve`, 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    // Check if template exists
    const existing = await queryOne(
      `SELECT * FROM label_templates WHERE id = $1`,
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Check if already approved
    if ((existing as { approval_status: string }).approval_status === 'approved') {
      return NextResponse.json(
        { error: 'Template is already approved' },
        { status: 400 }
      );
    }

    // Approve template
    const result = await query<{
      id: string;
      template_name: string;
      product_name: string;
      label_image_url: string;
    }>(
      `UPDATE label_templates 
       SET approval_status = 'approved',
           approved_by_admin_id = $1,
           approved_at = NOW(),
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [authResult.session!.admin_user_id, id]
    );

    const template = result[0];

    // Get count of affected products
    const affectedProducts = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM products WHERE label_template_id = $1`,
      [template.id]
    );

    const productCount = parseInt(affectedProducts[0]?.count || '0', 10);

    // Update all products using this template to display the approved label image
    if (productCount > 0) {
      await query(
        `UPDATE products 
         SET image = $1, 
             updated_at = NOW()
         WHERE label_template_id = $2`,
        [template.label_image_url, template.id]
      );

      // Invalidate product list cache so updated images show immediately in shop
      try {
        revalidatePath('/api/products');
        revalidatePath('/shop');
        console.log(`[Label Approval] Revalidated product caches for ${productCount} products`);
      } catch (revalidateError) {
        // Log but don't fail the request if revalidation fails
        console.error('[Label Approval] Cache revalidation failed:', revalidateError);
      }
    }

    // Log admin action
    logAdminAction(
      authResult.session!,
      'approve_label_template',
      template.id,
      ip,
      { 
        template_name: template.template_name, 
        product_name: template.product_name,
        products_updated: productCount
      }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: `/api/admin/label-templates/${id}/approve`,
      method: 'POST',
      details: { 
        action: 'label_template_approved',
        template_name: template.template_name,
        product_name: template.product_name,
        products_updated: productCount
      },
      severity: 'low',
    });

    return NextResponse.json({ template });
  } catch (error) {
    securityLogger.logError('Failed to approve label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to approve label template' },
      { status: 500 }
    );
  }
}
