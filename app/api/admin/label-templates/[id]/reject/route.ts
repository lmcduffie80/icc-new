import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';
import { labelTemplateApprovalSchema } from '@/lib/validation';

// Force Node.js runtime
export const runtime = 'nodejs';

// POST: Reject label template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/admin/label-templates/${id}/reject`, 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const body = await request.json();

    // Validate input
    const validationResult = labelTemplateApprovalSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/label-templates/${id}/reject`,
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

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

    // Reject template
    const result = await query<{
      id: string;
      template_name: string;
      product_name: string;
    }>(
      `UPDATE label_templates 
       SET approval_status = 'rejected',
           approved_by_admin_id = $1,
           approved_at = NOW(),
           rejection_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [authResult.session!.admin_user_id, data.rejection_reason || null, id]
    );

    const template = result[0];

    // Log admin action
    logAdminAction(
      authResult.session!,
      'reject_label_template',
      template.id,
      ip,
      { 
        template_name: template.template_name, 
        product_name: template.product_name,
        rejection_reason: data.rejection_reason || 'No reason provided'
      }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: `/api/admin/label-templates/${id}/reject`,
      method: 'POST',
      details: { 
        action: 'label_template_rejected',
        template_name: template.template_name,
        product_name: template.product_name,
        rejection_reason: data.rejection_reason || 'No reason provided'
      },
      severity: 'low',
    });

    return NextResponse.json({ template });
  } catch (error) {
    securityLogger.logError('Failed to reject label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to reject label template' },
      { status: 500 }
    );
  }
}
