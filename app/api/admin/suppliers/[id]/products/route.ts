import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query } from '@/lib/db';

/**
 * GET /api/admin/suppliers/[id]/products
 * Returns all products assigned to a supplier with pricing and margin data.
 * Used by the contract builder to auto-populate the product pricing table.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/suppliers/[id]/products',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const products = await query(`
      SELECT 
        p.id as product_id,
        p.name,
        p.sku,
        p.price,
        p.original_price,
        p.unit_of_measure,
        p.attributes,
        p.margin_split_percentage,
        p.icc_margin_percent
      FROM products p
      WHERE p.supplier_id = $1
        AND p.deleted_at IS NULL
        AND p.approval_status IN ('admin_approved', 'supplier_approved', 'published')
      ORDER BY p.name ASC
    `, [id]);

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching supplier products:', error);
    securityLogger.logError('Failed to fetch supplier products for contract builder', error, ip);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}
