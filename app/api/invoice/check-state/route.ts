import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET: Check if user has any invoice matching the given state
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/invoice/check-state', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. AUTHENTICATION
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. GET AND VALIDATE STATE FROM QUERY PARAM
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');

  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return NextResponse.json(
      { error: 'Invalid state parameter. Must be 2 uppercase letters.' },
      { status: 400 }
    );
  }

  try {
    // 4. CHECK IF USER IS INVOICE-EXEMPT
    const profile = await queryOne<{ invoice_exempt: boolean }>(
      `SELECT invoice_exempt FROM user_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    if (profile?.invoice_exempt) {
      return NextResponse.json({
        hasMatchingInvoice: true,
        state,
        invoiceExempt: true,
      });
    }

    // 5. CHECK FOR MATCHING INVOICE IN user_invoices TABLE
    const invoices = await query<{ id: string }>(
      `SELECT id FROM user_invoices WHERE user_id = $1 AND state = $2 LIMIT 1`,
      [session.user.id, state]
    );

    return NextResponse.json({
      hasMatchingInvoice: invoices.length > 0,
      state,
    });
  } catch (error) {
    securityLogger.logError('Failed to check invoice state', error, ip);
    return NextResponse.json({ error: 'Failed to check invoice' }, { status: 500 });
  }
}
