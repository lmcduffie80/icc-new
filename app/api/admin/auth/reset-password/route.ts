import { NextRequest, NextResponse } from 'next/server';
import { queryOne, withTransaction } from '@/lib/db';
import { hashAdminPassword } from '@/lib/admin-password';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { resetPasswordSchema } from '@/lib/validation';

interface TokenRecord {
  id: string;
  admin_user_id: string;
  used_at: string | null;
  expires_at: string;
  email: string;
  name: string;
}

/**
 * POST /api/admin/auth/reset-password
 * Complete password reset with new password
 *
 * Security:
 * - NO IP whitelist (public endpoint for emergency access)
 * - Rate limiting: 5 req/min per IP (auth tier)
 * - Token validation (exists, not expired, not used)
 * - Password strength validation
 * - Single-use token enforcement
 * - Session invalidation
 * - Account unlock
 * - Database transaction for atomicity
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // 1. RATE LIMITING (auth tier: 5/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.auth);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/admin/auth/reset-password', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // 2. INPUT VALIDATION
    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);
    if (!result.success) {
      securityLogger.logValidationFailure(
        '/api/admin/auth/reset-password',
        ip,
        result.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, newPassword } = result.data;

    // 3. VERIFY TOKEN (atomic check: exists, not expired, not used)
    const tokenRecord = await queryOne<TokenRecord>(
      `SELECT rt.id, rt.admin_user_id, rt.used_at, rt.expires_at, au.email, au.name
       FROM admin_password_reset_tokens rt
       JOIN admin_users au ON au.id = rt.admin_user_id
       WHERE rt.token = $1
         AND rt.used_at IS NULL
         AND rt.expires_at > NOW()`,
      [token]
    );

    if (!tokenRecord) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/admin/auth/reset-password',
        method: 'POST',
        details: { reason: 'Invalid or expired token' },
        severity: 'high',
      });
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // 4. HASH NEW PASSWORD
    const passwordHash = await hashAdminPassword(newPassword);

    // 5. UPDATE PASSWORD, CLEAR LOCKOUT, MARK TOKEN AS USED, INVALIDATE SESSIONS
    // All four writes must succeed or fail together: marking the token as
    // used while leaving the password unchanged would lock the admin out.
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE admin_users
         SET password_hash = $1,
             password_set_at = NOW(),
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, tokenRecord.admin_user_id]
      );

      await client.query(
        'UPDATE admin_password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [tokenRecord.id]
      );

      await client.query(
        'DELETE FROM admin_sessions WHERE admin_user_id = $1',
        [tokenRecord.admin_user_id]
      );
    });

    // 6. LOG SUCCESSFUL PASSWORD RESET
    securityLogger.logEvent({
      type: 'admin_action',
      userId: tokenRecord.admin_user_id,
      username: tokenRecord.email,
      ip,
      path: '/api/admin/auth/reset-password',
      method: 'POST',
      details: { action: 'password_reset_completed' },
      severity: 'high',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset failed:', error);

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/admin/auth/reset-password',
      method: 'POST',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'high',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
