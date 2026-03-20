import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { generatePresignedUploadUrl } from '@/lib/s3';
import { queryOne } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { licenseUploadSchema, licenseConfirmSchema } from '@/lib/validation';

interface UserLicenseRow {
  id: string;
  user_id: string;
  license_url: string;
  license_state: string | null;
  license_filename: string | null;
  license_file_type: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

// POST: Generate presigned URL for license upload
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/license/upload', 'POST');
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
      : 'license';

    const validationResult = licenseUploadSchema.safeParse({
      filename: sanitizedFileName,
      contentType,
      size,
      state,
    });

    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/license/upload',
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    // 4. GENERATE S3 KEY AND PRESIGNED URL
    const key = `license-uploads/${session.user.id}/${Date.now()}-${sanitizedFileName}`;

    const result = await generatePresignedUploadUrl(key, contentType, size);

    if ('error' in result) {
      securityLogger.logEvent({
        type: 'admin_action',
        userId: session.user.id,
        ip,
        path: '/api/license/upload',
        method: 'POST',
        details: { filename: fileName, size, contentType, success: false, error: result.error },
        severity: 'low',
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/license/upload',
      method: 'POST',
      details: { filename: fileName, size, contentType, state: validationResult.data.state, success: true },
      severity: 'low',
    });

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
      state: validationResult.data.state,
    });
  } catch (error) {
    securityLogger.logError('License upload URL generation failed', error, ip);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

// PATCH: Confirm upload and save license metadata to DB
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. RATE LIMITING
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/license/upload', 'PATCH');
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

    const validationResult = licenseConfirmSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/license/upload',
        ip,
        validationResult.error.issues,
        'PATCH'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { licenseUrl, state, filename, fileType } = validationResult.data;

    // 4. SAVE TO DATABASE — always insert a new row so we keep history
    const license = await queryOne<UserLicenseRow>(
      `INSERT INTO user_licenses (user_id, license_url, license_state, license_filename, license_file_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, license_url, license_state, license_filename, license_file_type, uploaded_at, created_at, updated_at`,
      [session.user.id, licenseUrl, state ?? null, filename, fileType]
    );

    const licenseMetadata = {
      license_url: licenseUrl,
      license_state: state ?? null,
      license_uploaded_at: license?.uploaded_at || new Date().toISOString(),
      license_filename: filename,
      license_file_type: fileType,
    };

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/license/upload',
      method: 'PATCH',
      details: { action: 'license_saved', licenseId: license?.id, filename, state, success: true },
      severity: 'low',
    });

    return NextResponse.json({ success: true, licenseMetadata });
  } catch (error) {
    securityLogger.logError('License upload confirmation failed', error, ip);
    return NextResponse.json({ error: 'Failed to confirm upload' }, { status: 500 });
  }
}
