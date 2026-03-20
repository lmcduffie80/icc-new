import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface TokenRecord {
  token: string;
  expires_at: string;
  used_at: string | null;
  email: string;
}

/**
 * GET /api/supplier/auth/validate-reset-token?token={token}
 * Validate password reset token without using it
 *
 * Security:
 * - NO IP whitelist (public endpoint)
 * - Rate limiting: 60 req/min per IP (relaxed tier)
 * - No user enumeration
 *
 * Purpose: Better UX - allows frontend to check token validity before showing form
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // 1. RATE LIMITING (relaxed tier: 60/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/supplier/auth/validate-reset-token', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // 2. GET TOKEN FROM QUERY PARAMS
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json(
        { valid: false },
        { status: 200 }
      );
    }

    // 3. VALIDATE TOKEN
    const tokenRecord = await queryOne<TokenRecord>(
      `SELECT rt.token, rt.expires_at, rt.used_at, su.email
       FROM supplier_password_reset_tokens rt
       JOIN supplier_users su ON su.id = rt.supplier_user_id
       WHERE rt.token = $1
         AND rt.used_at IS NULL
         AND rt.expires_at > NOW()`,
      [token]
    );

    if (!tokenRecord) {
      return NextResponse.json(
        { valid: false },
        { status: 200 }
      );
    }

    // Token is valid
    return NextResponse.json(
      {
        valid: true,
        email: tokenRecord.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Token validation failed:', error);

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/supplier/auth/validate-reset-token',
      method: 'GET',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'medium',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

