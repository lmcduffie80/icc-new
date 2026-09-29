import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

// DELETE /api/admin/distributor-pricing/[id] — remove distributor pricing for a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('distributors.manage');
  if (auth.error) return auth.error;

  const { id } = await params;
  const ip = getClientIp(request);

  const deleted = await query(
    `DELETE FROM distributor_pricing WHERE id = $1 RETURNING id`,
    [id]
  );

  if (!deleted.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  securityLogger.logAdminAction(
    auth.session.user.id,
    auth.session.user.name,
    'delete_distributor_pricing',
    id,
    ip
  );

  return NextResponse.json({ success: true });
}
