import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { queryOne, query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp, checkEmailBasedRateLimit } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { requestResetSchema } from '@/lib/validation';
import { sendAdminPasswordResetEmail } from '@/lib/email';

// Generic success message (prevents user enumeration)
const GENERIC_SUCCESS_MESSAGE = 'If an admin account exists with that email, you will receive a password reset link shortly.';

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

/**
 * POST /api/admin/auth/request-reset
 * Request password reset for admin account
 *
 * Security:
 * - NO IP whitelist (public endpoint for emergency access)
 * - Rate limiting: 5 req/min per IP (critical tier)
 * - Rate limiting: 3 req/hour per email
 * - Always returns success (no user enumeration)
 * - All attempts logged
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // 1. IP-BASED RATE LIMITING (critical tier: 5/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.critical);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/admin/auth/request-reset', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // 2. INPUT VALIDATION
    const body = await request.json();
    const result = requestResetSchema.safeParse(body);
    if (!result.success) {
      securityLogger.logValidationFailure(
        '/api/admin/auth/request-reset',
        ip,
        result.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      );
    }

    const { email } = result.data;

    // 3. EMAIL-BASED RATE LIMITING (3 req/hour per email)
    const emailRateLimitKey = `admin_reset_email:${email.toLowerCase()}`;
    const emailRateLimit = await checkEmailBasedRateLimit(emailRateLimitKey, 3, 3600);
    if (!emailRateLimit.success) {
      // Still return success to avoid enumeration, but don't send email
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/admin/auth/request-reset',
        method: 'POST',
        details: { email, reason: 'Email rate limit exceeded' },
        severity: 'medium',
      });
      return NextResponse.json(
        { message: GENERIC_SUCCESS_MESSAGE },
        { status: 200 }
      );
    }

    // 4. BUSINESS LOGIC
    // Look up admin user by email
    const adminUser = await queryOne<AdminUser>(
      'SELECT id, email, name FROM admin_users WHERE email = $1',
      [email]
    );

    if (!adminUser) {
      // Silent fail - log but return success
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/admin/auth/request-reset',
        method: 'POST',
        details: { email, reason: 'Email not found' },
        severity: 'low',
      });
      return NextResponse.json(
        { message: GENERIC_SUCCESS_MESSAGE },
        { status: 200 }
      );
    }

    // Generate cryptographically secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token in database
    await query(
      `INSERT INTO admin_password_reset_tokens
       (admin_user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUser.id, token, expiresAt, ip, userAgent || null]
    );

    // Send password reset email
    const resetUrl = `${process.env.BETTER_AUTH_URL}/admin/reset-password/${token}`;
    await sendAdminPasswordResetEmail({
      to: adminUser.email,
      subject: 'Admin Password Reset Request',
      name: adminUser.name,
      resetUrl,
      expiresAt,
      ip,
    });

    // Log successful request
    securityLogger.logEvent({
      type: 'admin_action',
      userId: adminUser.id,
      username: adminUser.email,
      ip,
      path: '/api/admin/auth/request-reset',
      method: 'POST',
      details: { action: 'password_reset_requested' },
      severity: 'medium',
    });

    return NextResponse.json(
      { message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset request failed:', error);

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/admin/auth/request-reset',
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
