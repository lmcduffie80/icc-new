import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

// PATCH /api/admin/users/[id]/invoice-exempt
// Toggle the invoice_exempt flag on a user's profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('users.update');
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    const body = await request.json();
    const { invoice_exempt } = body;

    if (typeof invoice_exempt !== 'boolean') {
      return NextResponse.json(
        { error: 'invoice_exempt must be a boolean' },
        { status: 400 }
      );
    }

    // Verify the user exists
    const user = await queryOne<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM "user" WHERE id = $1',
      [id]
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Upsert the user_profiles row — create if missing, update if present
    const profile = await queryOne<{ invoice_exempt: boolean }>(
      `INSERT INTO user_profiles (user_id, invoice_exempt, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET invoice_exempt = $2,
             updated_at = NOW()
       RETURNING invoice_exempt`,
      [id, invoice_exempt]
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: auth.session.adminUser.id,
      ip,
      path: `/api/admin/users/${id}/invoice-exempt`,
      method: 'PATCH',
      details: {
        action: 'set_invoice_exempt',
        target_user_id: id,
        target_user_email: user.email,
        invoice_exempt,
      },
      severity: 'medium',
    });

    return NextResponse.json({
      success: true,
      invoice_exempt: profile!.invoice_exempt,
    });
  } catch (error) {
    securityLogger.logError('Failed to update invoice_exempt', error, ip);
    return NextResponse.json(
      { error: 'Failed to update invoice exemption' },
      { status: 500 }
    );
  }
}
