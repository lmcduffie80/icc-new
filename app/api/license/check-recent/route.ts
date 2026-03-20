import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface UserLicenseRow {
  id: string;
  license_url: string;
  license_state: string | null;
  uploaded_at: string;
  license_filename: string | null;
  license_file_type: string | null;
}

// GET: Check if the authenticated user has uploaded a license within the last 365 days
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/license/check-recent', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. AUTHENTICATION
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. CHECK user_licenses FOR A RECENT UPLOAD (within the last 365 days)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoffDate = oneYearAgo.toISOString();

    const license = await queryOne<UserLicenseRow>(
      `SELECT id, license_url, license_state, uploaded_at, license_filename, license_file_type
       FROM user_licenses
       WHERE user_id = $1
         AND uploaded_at > $2
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [session.user.id, cutoffDate]
    );

    if (license) {
      return NextResponse.json({
        hasRecentLicense: true,
        recentLicense: {
          license_url: license.license_url,
          license_state: license.license_state,
          license_uploaded_at: license.uploaded_at,
          license_filename: license.license_filename,
          license_file_type: license.license_file_type,
        },
      });
    }

    return NextResponse.json({
      hasRecentLicense: false,
      recentLicense: null,
    });
  } catch (error) {
    securityLogger.logError('Failed to check recent license', error, ip);
    return NextResponse.json({ error: 'Failed to check recent license' }, { status: 500 });
  }
}
