import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface UserInvoiceRow {
  id: string;
  file_url: string;
  state: string;
  created_at: string;
  filename: string;
  file_type: string;
}

interface UserProfileRow {
  invoice_exempt: boolean;
}

// GET: Check if the authenticated user has uploaded an invoice within the last 6 months
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/invoice/check-recent', 'GET');
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

    // 3. CHECK user_invoices FOR A RECENT UPLOAD (within the last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffDate = sixMonthsAgo.toISOString();

    const invoice = await queryOne<UserInvoiceRow>(
      `SELECT id, file_url, state, created_at, filename, file_type
       FROM user_invoices
       WHERE user_id = $1
         AND created_at > $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [session.user.id, cutoffDate]
    );

    if (invoice) {
      return NextResponse.json({
        hasRecentInvoice: true,
        recentInvoice: {
          invoice_url: invoice.file_url,
          invoice_state: invoice.state,
          invoice_uploaded_at: invoice.created_at,
          invoice_filename: invoice.filename,
          invoice_file_type: invoice.file_type,
        },
      });
    }

    // 4. CHECK IF USER IS INVOICE-EXEMPT (no recent invoice found)
    const profile = await queryOne<UserProfileRow>(
      `SELECT invoice_exempt FROM user_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    if (profile?.invoice_exempt) {
      return NextResponse.json({
        hasRecentInvoice: true,
        recentInvoice: null,
        invoiceExempt: true,
      });
    }

    return NextResponse.json({
      hasRecentInvoice: false,
      recentInvoice: null,
    });
  } catch (error) {
    securityLogger.logError('Failed to check recent invoice', error, ip);
    return NextResponse.json({ error: 'Failed to check recent invoice' }, { status: 500 });
  }
}
