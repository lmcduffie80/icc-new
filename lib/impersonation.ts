import { queryOne } from './db';

export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  adminName: string;
  adminEmail: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  targetTenantId: string | null;
  token: string;
  expiresAt: string;
}

interface ImpersonationRow {
  id: string;
  admin_user_id: string;
  admin_name: string;
  admin_email: string;
  target_user_id: string;
  target_user_name: string;
  target_user_email: string;
  target_tenant_id: string | null;
  token: string;
  expires_at: string;
}

/**
 * Validates an impersonation token from the cookie and returns the session
 * details if it's still active and unexpired.
 * Returns null if the token is invalid, expired, or already ended.
 */
export async function getImpersonationSession(
  token: string
): Promise<ImpersonationSession | null> {
  if (!token || token.length < 32) return null;

  const row = await queryOne<ImpersonationRow>(
    `SELECT
       s.id, s.admin_user_id, s.target_user_id, s.target_tenant_id, s.token, s.expires_at,
       a.name AS admin_name, a.email AS admin_email,
       u.name AS target_user_name, u.email AS target_user_email
     FROM admin_impersonation_sessions s
     JOIN admin_users a ON a.id = s.admin_user_id
     JOIN "user" u ON u.id = s.target_user_id
     WHERE s.token = $1
       AND s.ended_at IS NULL
       AND s.expires_at > NOW()`,
    [token]
  );

  if (!row) return null;

  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    adminName: row.admin_name,
    adminEmail: row.admin_email,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_name,
    targetUserEmail: row.target_user_email,
    targetTenantId: row.target_tenant_id,
    token: row.token,
    expiresAt: row.expires_at,
  };
}

/**
 * Reads impersonation context from Next.js request headers (set by middleware).
 * Call this in Server Components or Route Handlers after middleware has run.
 */
export function getImpersonationContext(headers: Headers): {
  isImpersonating: boolean;
  adminName: string | null;
  adminEmail: string | null;
  targetUserId: string | null;
  targetUserName: string | null;
} {
  const targetUserId = headers.get('x-impersonating-user-id');
  const adminName = headers.get('x-impersonating-admin-name');
  const adminEmail = headers.get('x-impersonating-admin-email');
  const targetUserName = headers.get('x-impersonating-user-name');

  return {
    isImpersonating: !!targetUserId,
    adminName,
    adminEmail,
    targetUserId,
    targetUserName,
  };
}

export const IMPERSONATION_COOKIE = 'admin_impersonation_token';
