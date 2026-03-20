import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { generatePresignedUploadUrl } from '@/lib/s3';
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

// GET: List all invoices for authenticated user
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/profile/invoices', 'GET');
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
    // 3. FETCH INVOICES
    const invoices = await query<UserInvoiceRow>(
      `SELECT id, user_id, state, file_url, filename, file_type, created_at, updated_at
       FROM user_invoices
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        state: inv.state,
        fileUrl: inv.file_url,
        filename: inv.filename,
        fileType: inv.file_type,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
      })),
    });
  } catch (error) {
    securityLogger.logError('Failed to fetch user invoices', error, ip);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST: Generate presigned URL for new invoice upload
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/profile/invoices', 'POST');
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
        '/api/profile/invoices',
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
        path: '/api/profile/invoices',
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
      path: '/api/profile/invoices',
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
    securityLogger.logError('User invoice upload URL generation failed', error, ip);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}

// PATCH: Confirm upload and save to database
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/profile/invoices', 'PATCH');
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
        '/api/profile/invoices',
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

    // 4. INSERT INTO DATABASE
    const invoice = await queryOne<UserInvoiceRow>(
      `INSERT INTO user_invoices (user_id, state, file_url, filename, file_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, state, file_url, filename, file_type, created_at, updated_at`,
      [session.user.id, state, invoiceUrl, filename, fileType]
    );

    // Log successful save
    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/profile/invoices',
      method: 'PATCH',
      details: {
        action: 'invoice_saved',
        invoiceId: invoice?.id,
        state,
        success: true,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      invoice: invoice
        ? {
            id: invoice.id,
            state: invoice.state,
            fileUrl: invoice.file_url,
            filename: invoice.filename,
            fileType: invoice.file_type,
            createdAt: invoice.created_at,
            updatedAt: invoice.updated_at,
          }
        : null,
    });
  } catch (error) {
    securityLogger.logError('User invoice save failed', error, ip);
    return NextResponse.json({ error: 'Failed to save invoice' }, { status: 500 });
  }
}
