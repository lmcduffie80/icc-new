import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';
import { labelTemplateUpdateSchema } from '@/lib/validation';

// Force Node.js runtime
export const runtime = 'nodejs';

// GET: Get specific label template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/admin/label-templates/${id}`, 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const template = await queryOne(
      `SELECT * FROM label_templates WHERE id = $1`,
      [id]
    );

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    securityLogger.logError('Failed to fetch label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to fetch label template' },
      { status: 500 }
    );
  }
}

// PUT: Update label template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/admin/label-templates/${id}`, 'PUT');
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
    const validationResult = labelTemplateUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/label-templates/${id}`,
        ip,
        validationResult.error.issues,
        'PUT'
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

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (data.product_name !== undefined) {
      updates.push(`product_name = $${paramIndex}`);
      values.push(data.product_name);
      paramIndex++;
    }

    if (data.template_name !== undefined) {
      updates.push(`template_name = $${paramIndex}`);
      values.push(data.template_name);
      paramIndex++;
    }

    if (data.label_image_url !== undefined) {
      updates.push(`label_image_url = $${paramIndex}`);
      values.push(data.label_image_url);
      paramIndex++;
    }

    if (data.short_description !== undefined) {
      updates.push(`short_description = $${paramIndex}`);
      values.push(data.short_description);
      paramIndex++;
    }

    if (data.long_description !== undefined) {
      updates.push(`long_description = $${paramIndex}`);
      values.push(data.long_description);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) { // Only updated_at
      return NextResponse.json({ template: existing });
    }

    values.push(id);
    const result = await query<{
      id: string;
      template_name: string;
    }>(
      `UPDATE label_templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const template = result[0];

    // Log admin action
    logAdminAction(
      authResult.session!,
      'update_label_template',
      template.id,
      ip,
      { template_name: template.template_name }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: `/api/admin/label-templates/${id}`,
      method: 'PUT',
      details: { 
        action: 'label_template_updated',
        template_name: template.template_name
      },
      severity: 'low',
    });

    return NextResponse.json({ template });
  } catch (error) {
    securityLogger.logError('Failed to update label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to update label template' },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete label template (set is_active to false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/admin/label-templates/${id}`, 'DELETE');
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

    // Soft delete
    await query(
      `UPDATE label_templates 
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Log admin action
    logAdminAction(
      authResult.session!,
      'delete_label_template',
      id,
      ip,
      { template_name: (existing as { template_name: string }).template_name }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: `/api/admin/label-templates/${id}`,
      method: 'DELETE',
      details: { 
        action: 'label_template_deleted',
        template_name: (existing as { template_name: string }).template_name
      },
      severity: 'low',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to delete label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to delete label template' },
      { status: 500 }
    );
  }
}
