import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { generatePresignedUploadUrl } from '@/lib/s3';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { invoiceUploadSchema, invoiceConfirmSchema } from '@/lib/validation';

interface UserInvoiceRow {
  id: string;
  user_id: string;
  state: string;
  file_url: string;
  filename: string;
  file_type: string;
  created_at: string;
  updated_at: string;
}

// POST: Generate presigned URL for invoice upload
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/invoice/upload', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. AUTHENTICATION
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 3. INPUT VALIDATION
    const body = await request.json();
    const { contentType, fileName, size, state } = body;

    // Sanitize filename to prevent path traversal
    const sanitizedFileName = fileName
      ? fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : 'invoice';

    // Validate with Zod schema
    const validationResult = invoiceUploadSchema.safeParse({
      filename: sanitizedFileName,
      contentType,
      size,
      state,
    });

    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/invoice/upload',
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    // 4. GENERATE S3 KEY AND PRESIGNED URL
    const key = `invoice-uploads/${session.user.id}/${Date.now()}-${sanitizedFileName}`;

    const result = await generatePresignedUploadUrl(key, contentType, size);

    if ('error' in result) {
      securityLogger.logEvent({
        type: 'admin_action',
        userId: session.user.id,
        ip,
        path: '/api/invoice/upload',
        method: 'POST',
        details: {
          filename: fileName,
          size,
          contentType,
          success: false,
          error: result.error,
        },
        severity: 'low',
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log successful URL generation
    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/invoice/upload',
      method: 'POST',
      details: {
        filename: fileName,
        size,
        contentType,
        state: validationResult.data.state,
        success: true,
      },
      severity: 'low',
    });

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
      state: validationResult.data.state,
    });
  } catch (error) {
    securityLogger.logError('Invoice upload URL generation failed', error, ip);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}

// PATCH: Confirm upload and return invoice metadata
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/invoice/upload', 'PATCH');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // 2. AUTHENTICATION
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 3. INPUT VALIDATION
    const body = await request.json();

    const validationResult = invoiceConfirmSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/invoice/upload',
        ip,
        validationResult.error.issues,
        'PATCH'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { invoiceUrl, state, filename, fileType } = validationResult.data;

    // 4. SAVE TO DATABASE (check if exists for same user+state, then update or insert)
    const existingInvoice = await queryOne<UserInvoiceRow>(
      `SELECT id FROM user_invoices WHERE user_id = $1 AND state = $2`,
      [session.user.id, state]
    );

    let invoice: UserInvoiceRow | null;
    if (existingInvoice) {
      // Update existing invoice
      invoice = await queryOne<UserInvoiceRow>(
        `UPDATE user_invoices
         SET file_url = $1, filename = $2, file_type = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, user_id, state, file_url, filename, file_type, created_at, updated_at`,
        [invoiceUrl, filename, fileType, existingInvoice.id]
      );
    } else {
      // Insert new invoice
      invoice = await queryOne<UserInvoiceRow>(
        `INSERT INTO user_invoices (user_id, state, file_url, filename, file_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, state, file_url, filename, file_type, created_at, updated_at`,
        [session.user.id, state, invoiceUrl, filename, fileType]
      );
    }

    // 5. CREATE INVOICE METADATA for response
    const invoiceMetadata = {
      invoice_url: invoiceUrl,
      invoice_state: state,
      invoice_uploaded_at: invoice?.created_at || new Date().toISOString(),
      invoice_filename: filename,
      invoice_file_type: fileType,
    };

    // Log successful confirmation
    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/invoice/upload',
      method: 'PATCH',
      details: {
        action: 'invoice_saved',
        invoiceId: invoice?.id,
        filename,
        state,
        success: true,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      invoiceMetadata,
    });
  } catch (error) {
    securityLogger.logError('Invoice upload confirmation failed', error, ip);
    return NextResponse.json(
      { error: 'Failed to confirm upload' },
      { status: 500 }
    );
  }
}
