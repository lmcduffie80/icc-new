import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { isIpWhitelisted } from '@/lib/env-validation';

interface AdminSession {
  id: string;
  admin_user_id: string;
  token: string;
  expires_at: string;
  admin_email: string;
  admin_name: string;
  role_name: string;
  permissions: string[];
}

export interface AdminAuthResult {
  authorized: boolean;
  response?: NextResponse | Response;
  session?: AdminSession;
}

/**
 * Verify admin session and check IP whitelist
 */
export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  const ip = getClientIp(request);

  try {
    // Check IP whitelist
    if (!isIpWhitelisted(ip)) {
      securityLogger.logIpWhitelistViolation(ip, request.url);
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        ),
      };
    }

    // Check rate limit for admin routes (100 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.admin);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, request.url, request.method);
      return {
        authorized: false,
        response: createRateLimitResponse(rateLimitResult.reset),
      };
    }

    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin_session')?.value;

    if (!sessionToken) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    // Verify session (supports standalone admins with no linked user account)
    const session = await queryOne<AdminSession>(
      `SELECT 
        s.id,
        s.admin_user_id,
        s.token,
        s.expires_at,
        COALESCE(au.email, u.email) as admin_email,
        COALESCE(au.name, u.name) as admin_name,
        r.name as role_name,
        r.permissions
      FROM admin_sessions s
      JOIN admin_users au ON au.id = s.admin_user_id
      LEFT JOIN "user" u ON u.id = au.user_id
      JOIN admin_roles r ON r.id = au.role_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
      [sessionToken]
    );

    if (!session) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Session expired or invalid' },
          { status: 401 }
        ),
      };
    }

    return {
      authorized: true,
      session,
    };
  } catch (error) {
    console.error('Admin auth verification error:', error);
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: request.url,
      method: request.method,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'high',
    });

    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Authentication verification failed' },
        { status: 500 }
      ),
    };
  }
}

/**
 * Log admin action for audit trail
 */
export function logAdminAction(
  session: AdminSession,
  action: string,
  targetId: string,
  ip: string,
  details?: Record<string, unknown>
): void {
  securityLogger.logAdminAction(
    session.admin_user_id,
    session.admin_email,
    action,
    targetId,
    ip,
    details
  );
}
