import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface ApprovalTimelineEvent {
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  notes: string | null;
  label_url: string | null;
  created_at: string;
}

interface ApprovedLabel {
  product_id: string;
  product_name: string;
  image: string | null;
  label_url: string | null;
  admin_label_url: string | null;
  approval_status: string;
  approval_notes: string | null;
  product_created_at: string;
  approval_timeline: ApprovalTimelineEvent[];
}

// GET /api/supplier/approvals/approved - Get approved labels with complete timeline
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
    const approvedLabels = await query<ApprovedLabel>(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.image,
        p.label_url,
        p.admin_label_url,
        p.approval_status,
        p.approval_notes,
        p.created_at as product_created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'action', pah.action,
              'performed_by', pah.performed_by,
              'performed_by_name', COALESCE(event_admin.name, 'Supplier'),
              'notes', pah.notes,
              'label_url', pah.label_url,
              'created_at', pah.created_at
            ) ORDER BY pah.created_at ASC
          ) FILTER (WHERE pah.action IN ('admin_approved', 'label_modified', 'supplier_approved_label')),
          '[]'::json
        ) as approval_timeline
      FROM products p
      LEFT JOIN product_approval_history pah ON pah.product_id = p.id
      LEFT JOIN admin_users event_admin ON event_admin.id = pah.performed_by
      WHERE p.supplier_id = $1 
        AND p.approval_status = 'published'
        AND EXISTS (
          SELECT 1 FROM product_approval_history 
          WHERE product_id = p.id 
          AND action = 'supplier_approved_label'
        )
      GROUP BY p.id, p.name, p.image, p.label_url, p.admin_label_url, 
               p.approval_status, p.approval_notes, p.created_at
      ORDER BY MAX(pah.created_at) DESC
      LIMIT 50`,
      [session.user.id]
    );

    return NextResponse.json({ approvedLabels });
  } catch (error) {
    console.error('Error fetching approved labels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approved labels' },
      { status: 500 }
    );
  }
}
