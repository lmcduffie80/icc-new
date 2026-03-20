import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query } from '@/lib/db';

// Force Node.js runtime
export const runtime = 'nodejs';

// GET: List approved label templates (for supplier use)
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/supplier/label-templates', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify supplier authentication
  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const productName = searchParams.get('product_name');

    // Build query - only show approved and active templates
    let sql = `
      SELECT 
        id,
        product_name,
        template_name,
        label_image_url,
        short_description,
        long_description,
        created_at
      FROM label_templates
      WHERE approval_status = 'approved'
        AND is_active = true
    `;

    const params: string[] = [];

    if (productName) {
      sql += ` AND product_name ILIKE $1`;
      params.push(`%${productName}%`);
    }

    sql += ` ORDER BY product_name, template_name`;

    const result = await query(sql, params);

    return NextResponse.json({
      templates: result,
      count: result.length,
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch label templates for supplier', error, ip);
    return NextResponse.json(
      { error: 'Failed to fetch label templates' },
      { status: 500 }
    );
  }
}
