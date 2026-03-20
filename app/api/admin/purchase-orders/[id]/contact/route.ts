import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/admin/purchase-orders/[id]/contact
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    const po = await queryOne<{
      vendor_id: number | null;
      supplier_id: string | null;
      vendor_name: string | null;
      supplier_email: string | null;
      supplier_name: string | null;
    }>(
      `SELECT 
        po.vendor_id, 
        po.supplier_id,
        v.name as vendor_name,
        su.email as supplier_email,
        su.company_name as supplier_name
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN supplier_users su ON su.id = po.supplier_id
      WHERE po.id = $1`,
      [id]
    );

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    // Determine type and return contact info
    if (po.supplier_id) {
      return NextResponse.json({
        type: 'supplier',
        name: po.supplier_name,
        email: po.supplier_email,
      });
    } else if (po.vendor_id) {
      return NextResponse.json({
        type: 'vendor',
        name: po.vendor_name,
        email: null, // Vendors don't have email in database
      });
    } else {
      return NextResponse.json(
        { error: 'Purchase order must have either a vendor or supplier' },
        { status: 400 }
      );
    }
  } catch (error) {
    securityLogger.logError('Failed to fetch PO contact info', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
