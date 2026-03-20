import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { supplierLoginSchema } from '@/lib/validation';
import { getSupplierUserByEmail, verifySupplierPassword, LOCKOUT_CONFIG } from '@/lib/supplier-auth';
import { query, queryOne } from '@/lib/db';
import { checkRateLimit, rateLimiters, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface SupplierSession {
  id: string;
  supplier_user_id: string;
  token: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

// POST /api/supplier/auth/login - Supplier login
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, rateLimiters.auth);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/supplier/auth/login', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const body = await request.json();

    // Validate input
    const validationResult = supplierLoginSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/supplier/auth/login',
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // Find supplier user
    const supplierUser = await getSupplierUserByEmail(email);

    if (!supplierUser) {
      securityLogger.logAuthFailure(email, ip, 'Supplier not found', userAgent);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if account is active
    if (!supplierUser.is_active) {
      securityLogger.logAuthFailure(email, ip, 'Inactive supplier account', userAgent);
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }

    // Check if account is locked
    if (supplierUser.locked_until && new Date(supplierUser.locked_until) > new Date()) {
      securityLogger.logAuthFailure(email, ip, 'Locked supplier account', userAgent);
      return NextResponse.json(
        { error: 'Account is locked. Please try again later.' },
        { status: 423 }
      );
    }

    // Verify password
    const isValid = await verifySupplierPassword(password, supplierUser.password_hash);

    if (!isValid) {
      // Increment failed attempts
      const attempts = (supplierUser.failed_login_attempts || 0) + 1;

      if (attempts >= LOCKOUT_CONFIG.maxAttempts) {
        // Lock the account
        await query(
          `UPDATE supplier_users 
           SET failed_login_attempts = $1, 
               locked_until = NOW() + INTERVAL '1 minute' * $2
           WHERE id = $3`,
          [attempts, LOCKOUT_CONFIG.lockoutDurationMinutes, supplierUser.id]
        );

        securityLogger.logAuthFailure(email, ip, `Account locked after ${attempts} failed attempts`, userAgent);

        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${LOCKOUT_CONFIG.lockoutDurationMinutes} minutes.` },
          { status: 423 }
        );
      }

      await query(
        'UPDATE supplier_users SET failed_login_attempts = $1 WHERE id = $2',
        [attempts, supplierUser.id]
      );

      securityLogger.logAuthFailure(email, ip, `Invalid password (attempt ${attempts})`, userAgent);

      const remaining = LOCKOUT_CONFIG.maxAttempts - attempts;
      return NextResponse.json(
        { error: `Invalid credentials. ${remaining} attempt(s) remaining.` },
        { status: 401 }
      );
    }

    // Success - reset failed attempts
    await query(
      'UPDATE supplier_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [supplierUser.id]
    );

    // Create supplier session
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;

    await queryOne<SupplierSession>(
      `INSERT INTO supplier_sessions (supplier_user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [supplierUser.id, sessionToken, expiresAt.toISOString(), ipAddress, userAgent || null]
    );

    // Set secure cookie
    const cookieStore = await cookies();
    cookieStore.set('supplier_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    securityLogger.logAuthSuccess(supplierUser.id, supplierUser.email, ip, userAgent);

    return NextResponse.json({
      success: true,
      user: {
        id: supplierUser.id,
        email: supplierUser.email,
        name: supplierUser.name,
        company_name: supplierUser.company_name,
      },
    });
  } catch (error) {
    securityLogger.logError('Supplier login failed', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

