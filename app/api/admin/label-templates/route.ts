import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query } from '@/lib/db';
import { labelTemplateSchema } from '@/lib/validation';

// Force Node.js runtime
export const runtime = 'nodejs';

// GET: List all label templates (with optional filtering)
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/label-templates', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const { searchParams } = new URL(request.url);
    const productName = searchParams.get('product_name');
    const approvalStatus = searchParams.get('approval_status');
    const isActive = searchParams.get('is_active');

    // Build query with filters
    let sql = `
      SELECT 
        id,
        product_name,
        template_name,
        label_image_url,
        short_description,
        long_description,
        approval_status,
        created_by_admin_id,
        approved_by_admin_id,
        approved_at,
        rejection_reason,
        is_active,
        created_at,
        updated_at
      FROM label_templates
      WHERE 1=1
    `;

    const params: (string | boolean)[] = [];
    let paramIndex = 1;

    if (productName) {
      sql += ` AND product_name ILIKE $${paramIndex}`;
      params.push(`%${productName}%`);
      paramIndex++;
    }

    if (approvalStatus) {
      sql += ` AND approval_status = $${paramIndex}`;
      params.push(approvalStatus);
      paramIndex++;
    }

    if (isActive !== null && isActive !== undefined) {
      sql += ` AND is_active = $${paramIndex}`;
      params.push(isActive === 'true');
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);

    return NextResponse.json({
      templates: result,
      count: result.length,
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch label templates', error, ip);
    return NextResponse.json(
      { error: 'Failed to fetch label templates' },
      { status: 500 }
    );
  }
}

// POST: Create new label template
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/label-templates', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const body = await request.json();
    console.log('[Label Template POST] Received body:', JSON.stringify(body, null, 2));
    console.log('[Label Template POST] Admin session:', authResult.session);

    // Validate input
    const validationResult = labelTemplateSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[Label Template POST] Validation failed:', validationResult.error.issues);
      securityLogger.logValidationFailure(
        '/api/admin/label-templates',
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

    // Insert label template
    const result = await query<{
      id: string;
      template_name: string;
      product_name: string;
    }>(
      `INSERT INTO label_templates (
        product_name,
        template_name,
        label_image_url,
        short_description,
        long_description,
        created_by_admin_id,
        approval_status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *`,
      [
        data.product_name,
        data.template_name,
        data.label_image_url,
        data.short_description,
        data.long_description || null,
        authResult.session!.admin_user_id,
      ]
    );

    const template = result[0];

    // Log admin action
    logAdminAction(
      authResult.session!,
      'create_label_template',
      template.id,
      ip,
      { template_name: template.template_name, product_name: template.product_name }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: '/api/admin/label-templates',
      method: 'POST',
      details: { 
        action: 'label_template_created',
        template_name: template.template_name,
        product_name: template.product_name
      },
      severity: 'low',
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('[Label Template POST] Error occurred:', error);
    console.error('[Label Template POST] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Label Template POST] Error message:', error instanceof Error ? error.message : String(error));
    securityLogger.logError('Failed to create label template', error, ip);
    return NextResponse.json(
      { error: 'Failed to create label template', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
