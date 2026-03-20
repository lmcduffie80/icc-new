import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { deleteFromS3, getKeyFromUrl } from '@/lib/s3';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface UserInvoiceRow {
  id: string;
  user_id: string;
  file_url: string;
}

// DELETE: Delete an invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const { id } = await params;

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, `/api/profile/invoices/${id}`, 'DELETE');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. AUTHENTICATION
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. VALIDATE ID FORMAT (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    // 4. VERIFY OWNERSHIP AND GET FILE URL
    const invoice = await queryOne<UserInvoiceRow>(
      `SELECT id, user_id, file_url FROM user_invoices WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 5. DELETE FROM S3
    const s3Key = getKeyFromUrl(invoice.file_url);
    if (s3Key) {
      try {
        await deleteFromS3(s3Key);
      } catch (s3Error) {
        // Log but continue with database deletion
        securityLogger.logError('Failed to delete invoice from S3', s3Error, ip);
      }
    }

    // 6. DELETE FROM DATABASE
    await queryOne(
      `DELETE FROM user_invoices WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    // Log successful deletion
    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: `/api/profile/invoices/${id}`,
      method: 'DELETE',
      details: {
        action: 'invoice_deleted',
        invoiceId: id,
        success: true,
      },
      severity: 'low',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Invoice deletion failed', error, ip);
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
  }
}
