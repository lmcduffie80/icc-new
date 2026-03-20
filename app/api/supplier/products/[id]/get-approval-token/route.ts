import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/supplier/products/[id]/get-approval-token - Get approval token for a product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!action || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json(
      { error: 'Invalid action. Must be "approve" or "reject"' },
      { status: 400 }
    );
  }

  try {
    // Verify product belongs to supplier and is pending approval
    const product = await queryOne<{
      id: string;
      supplier_id: string;
      approval_status: string;
    }>(
      `SELECT id, supplier_id, approval_status
       FROM products
       WHERE id = $1 AND supplier_id = $2 AND deleted_at IS NULL AND approval_status = 'label_pending_supplier_approval'`,
      [id, session.user.id]
    );

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found or not pending approval' },
        { status: 404 }
      );
    }

    // Get unused token
    const token = await queryOne<{
      token: string;
    }>(
      `SELECT token
       FROM label_approval_tokens
       WHERE product_id = $1 
         AND supplier_id = $2
         AND action = $3
         AND expires_at > NOW()
         AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, session.user.id, action]
    );

    if (!token) {
      return NextResponse.json(
        { error: 'No valid approval token found. Please use the link from your email.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ token: token.token });
  } catch (error) {
    console.error('Error getting approval token:', error);
    return NextResponse.json(
      { error: 'Failed to get approval token' },
      { status: 500 }
    );
  }
}

