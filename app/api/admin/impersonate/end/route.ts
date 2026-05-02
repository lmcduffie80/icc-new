import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { securityLogger } from '@/lib/security-logger';

interface ImpersonationRow {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  admin_name: string;
  target_user_email: string;
}

// POST /api/admin/impersonate/end
// Called from the impersonation banner. Ends the active impersonation session,
// clears the cookie, and redirects back to the admin users list.
// Note: This route does NOT go through verifyAdminAuth because the caller
// is in the customer portal (no admin session cookie) — only the impersonation
// token is available. We validate ownership via the token itself.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (token) {
    const row = await queryOne<ImpersonationRow>(
      `SELECT s.id, s.admin_user_id, s.target_user_id,
              a.name AS admin_name, u.email AS target_user_email
       FROM admin_impersonation_sessions s
       JOIN admin_users a ON a.id = s.admin_user_id
       JOIN "user" u ON u.id = s.target_user_id
       WHERE s.token = $1 AND s.ended_at IS NULL`,
      [token]
    );

    if (row) {
      await query(
        `UPDATE admin_impersonation_sessions SET ended_at = NOW() WHERE id = $1`,
        [row.id]
      );

      securityLogger.logAdminAction(
        row.admin_user_id,
        row.admin_name,
        'impersonation_ended',
        row.target_user_id,
        ip,
        { targetUserEmail: row.target_user_email }
      );
    }
  }

  const response = NextResponse.redirect(new URL('/admin/users', request.url));
  response.cookies.delete(IMPERSONATION_COOKIE);
  return response;
}
