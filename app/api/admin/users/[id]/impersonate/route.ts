import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { randomBytes } from 'crypto';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { securityLogger } from '@/lib/security-logger';

interface UserRow {
  id: string;
  name: string;
  email: string;
}

interface TenantMembershipRow {
  tenant_id: string;
  slug: string;
}

// POST /api/admin/users/[id]/impersonate
// Creates an impersonation session and returns a redirect URL to the customer portal.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id: targetUserId } = await params;
  const adminUserId = authResult.session!.admin_user_id;
  const adminName = authResult.session!.admin_name;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Verify target user exists
  const targetUser = await queryOne<UserRow>(
    `SELECT id, name, email FROM "user" WHERE id = $1`,
    [targetUserId]
  );

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Find which tenant this user belongs to so we know where to redirect
  const membership = await queryOne<TenantMembershipRow>(
    `SELECT tm.tenant_id, t.slug
     FROM tenant_memberships tm
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1
     ORDER BY tm.created_at ASC
     LIMIT 1`,
    [targetUserId]
  );

  // Default to 'icc' tenant if no membership is found
  const tenantSlug = membership?.slug ?? 'icc';
  const tenantId = membership?.tenant_id ?? null;

  // End any existing active impersonation sessions for this admin
  await query(
    `UPDATE admin_impersonation_sessions
     SET ended_at = NOW()
     WHERE admin_user_id = $1 AND ended_at IS NULL`,
    [adminUserId]
  );

  // Generate a cryptographically secure token
  const token = randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    `INSERT INTO admin_impersonation_sessions
       (admin_user_id, target_user_id, target_tenant_id, token, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminUserId, targetUserId, tenantId, token, expiresAt.toISOString()]
  );

  securityLogger.logAdminAction(
    adminUserId,
    adminName,
    'impersonation_started',
    targetUserId,
    ip,
    { targetUserEmail: targetUser.email, targetUserName: targetUser.name, tenantSlug }
  );

  const redirectUrl = `/${tenantSlug}`;
  const response = NextResponse.json({ redirectUrl });

  response.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return response;
}
