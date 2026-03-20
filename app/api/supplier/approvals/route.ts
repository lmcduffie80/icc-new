import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface PendingApproval {
  id: string;
  product_id: string;
  product_name: string;
  admin_label_url: string | null;
  label_url: string | null;
  approval_notes: string | null;
  updated_at: string;
}

// GET /api/supplier/approvals - Get pending label approvals
export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const approvals = await query<PendingApproval>(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.admin_label_url,
        p.label_url,
        p.approval_notes,
        p.updated_at
      FROM products p
      WHERE p.supplier_id = $1 
        AND p.approval_status = 'label_pending_supplier_approval'
      ORDER BY p.updated_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approvals' },
      { status: 500 }
    );
  }
}

