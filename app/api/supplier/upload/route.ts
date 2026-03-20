import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuthWithoutRateLimit } from '@/lib/supplier-middleware';
import { generatePresignedUploadUrl } from '@/lib/s3';
import { getClientIp, checkRateLimit, rateLimiters, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { supplierUploadSchema } from '@/lib/validation';

// POST: Generate presigned URL for supplier file uploads (SDS, labels, images)
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Apply relaxed rate limiting for uploads (60 req/min)
  // Upload endpoints need higher limits due to image compression attempts and multiple file uploads
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/supplier/upload', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }
  
  // Verify supplier auth (without additional rate limiting)
  const authResult = await verifySupplierAuthWithoutRateLimit(request);
  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  const supplierId = authResult.session.user.id;

  try {
    const body = await request.json();
    const { contentType, fileName, size } = body;

    // Sanitize filename first before validation
    const sanitizedFileName = fileName
      ? fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : 'file';

    // Validate input with Zod (supports images and PDFs)
    const validationResult = supplierUploadSchema.safeParse({
      filename: sanitizedFileName,
      contentType,
      size,
    });

    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/supplier/upload',
        ip,
        validationResult.error.issues,
        'POST'
      );
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Generate unique key for supplier uploads
    const extension = sanitizedFileName.split('.').pop() || contentType.split('/')[1];
    const key = `supplier-uploads/${supplierId}/${Date.now()}-${sanitizedFileName.replace(/\.[^/.]+$/, '')}.${extension}`;

    // Generate presigned URL with validation
    const result = await generatePresignedUploadUrl(key, contentType, size);

    if ('error' in result) {
      securityLogger.logUploadAttempt(
        supplierId,
        fileName,
        size,
        contentType,
        ip,
        false
      );
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log successful upload URL generation
    securityLogger.logUploadAttempt(
      supplierId,
      fileName,
      size,
      contentType,
      ip,
      true
    );

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/supplier/upload',
      method: 'POST',
      details: {
        action: 'upload_url_generated',
        supplier_id: supplierId,
        fileName,
        contentType,
        size,
      },
      severity: 'low',
    });

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
    });
  } catch (error) {
    console.error('Error generating supplier upload URL:', error);
    securityLogger.logError('Failed to generate supplier upload URL', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
