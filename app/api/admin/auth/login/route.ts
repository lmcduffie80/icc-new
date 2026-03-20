import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { verifyAdminPassword, LOCKOUT_CONFIG } from '@/lib/admin-password';
import { randomBytes } from 'crypto';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { isIpWhitelisted } from '@/lib/env-validation';
import { adminLoginSchema } from '@/lib/validation';

interface AdminUserWithPassword {
  id: string;
  user_id: string;
  role_id: string;
  password_hash: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  user_email: string;
  user_name: string;
  role_name: string;
}

interface AdminSession {
  id: string;
  admin_user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

// POST /api/admin/auth/login - Admin-specific login
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || undefined;
  
  try {
    // IP Whitelist check
    if (!isIpWhitelisted(ip)) {
      securityLogger.logIpWhitelistViolation(ip, '/api/admin/auth/login');
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Rate limiting - auth routes (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.auth);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/admin/auth/login', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const body = await request.json();

    // Validate input with Zod
    const validationResult = adminLoginSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/auth/login',
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

    // Find admin user by email (supports standalone admins with no linked user account)
    const adminUser = await queryOne<AdminUserWithPassword>(
      `SELECT 
        au.id,
        au.user_id,
        au.role_id,
        au.password_hash,
        au.failed_login_attempts,
        au.locked_until,
        COALESCE(au.email, u.email) as user_email,
        COALESCE(au.name, u.name) as user_name,
        r.name as role_name
      FROM admin_users au
      LEFT JOIN "user" u ON u.id = au.user_id
      JOIN admin_roles r ON r.id = au.role_id
      WHERE COALESCE(au.email, u.email) = $1`,
      [email]
    );

    if (!adminUser) {
      // Don't reveal whether the user exists
      securityLogger.logAuthFailure(email, ip, 'User not found', userAgent);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (adminUser.locked_until) {
      const lockedUntil = new Date(adminUser.locked_until);
      if (lockedUntil > new Date()) {
        const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        securityLogger.logAuthFailure(email, ip, 'Account locked', userAgent);
        return NextResponse.json(
          { error: `Account locked. Try again in ${minutesRemaining} minute(s).` },
          { status: 423 }
        );
      }
      // Lock expired, reset attempts
      await query(
        'UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [adminUser.id]
      );
    }

    // Check if admin password is set
    if (!adminUser.password_hash) {
      securityLogger.logAuthFailure(email, ip, 'Password not set', userAgent);
      return NextResponse.json(
        { error: 'Admin password not set. Contact a super admin.' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyAdminPassword(password, adminUser.password_hash);

    if (!isValid) {
      // Increment failed attempts
      const attempts = (adminUser.failed_login_attempts || 0) + 1;
      
      if (attempts >= LOCKOUT_CONFIG.maxAttempts) {
        // Lock the account
        await query(
          `UPDATE admin_users 
           SET failed_login_attempts = $1, 
               locked_until = NOW() + INTERVAL '1 minute' * $2
           WHERE id = $3`,
          [attempts, LOCKOUT_CONFIG.lockoutDurationMinutes, adminUser.id]
        );
        
        securityLogger.logAccountLockout(email, ip, attempts);
        
        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${LOCKOUT_CONFIG.lockoutDurationMinutes} minutes.` },
          { status: 423 }
        );
      }

      await query(
        'UPDATE admin_users SET failed_login_attempts = $1 WHERE id = $2',
        [attempts, adminUser.id]
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
      'UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [adminUser.id]
    );

    // Create admin session
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;

    await queryOne<AdminSession>(
      `INSERT INTO admin_sessions (admin_user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [adminUser.id, sessionToken, expiresAt.toISOString(), ipAddress, userAgent || null]
    );

    // Set secure cookie
    const cookieStore = await cookies();
    cookieStore.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    // Log successful authentication
    securityLogger.logAuthSuccess(adminUser.id, email, ip, userAgent);

    return NextResponse.json({
      success: true,
      user: {
        email: adminUser.user_email,
        name: adminUser.user_name,
        role: adminUser.role_name,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/admin/auth/login',
      method: 'POST',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'high',
    });
    
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

