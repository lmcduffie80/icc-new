import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';

// GET /api/distributor/status — returns whether the current session user is a distributor
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult.reset);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ isDistributor: false, authenticated: false });
  }

  const profile = await queryOne<{ is_distributor: boolean }>(
    `SELECT COALESCE(is_distributor, false) AS is_distributor
     FROM user_profiles WHERE user_id = $1`,
    [session.user.id]
  );

  void ip; // available for logging if needed

  return NextResponse.json({
    authenticated: true,
    isDistributor: profile?.is_distributor ?? false,
  });
}
