import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { generatePresignedUploadUrl } from '@/lib/s3';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { imageUploadSchema } from '@/lib/validation';

// POST: Generate presigned URL for product image upload
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Verify admin auth with IP whitelist and rate limiting
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow admins with either create or update permission
  const hasPermission = session.permissions.includes('products.create') || 
                        session.permissions.includes('products.update');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/products/upload',
      'products.create or products.update',
      ip
    );
    return NextResponse.json({ error: 'Forbidden - Missing product permission' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { contentType, fileName, size } = body;

    // Sanitize filename first before validation
    const sanitizedFileName = fileName
      ? fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : 'image';

    // Validate input with Zod (using sanitized filename)
    const validationResult = imageUploadSchema.safeParse({
      filename: sanitizedFileName,
      contentType,
      size,
    });

    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/products/upload',
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

    // Generate unique key
    const extension = sanitizedFileName.split('.').pop() || contentType.split('/')[1];
    const key = `product-pictures/${Date.now()}-${sanitizedFileName.replace(/\.[^/.]+$/, '')}.${extension}`;

    // Generate presigned URL with validation
    const result = await generatePresignedUploadUrl(key, contentType, size);

    if ('error' in result) {
      securityLogger.logUploadAttempt(
        session.user.id,
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
      session.user.id,
      fileName,
      size,
      contentType,
      ip,
      true
    );

    logAdminAction(
      authResult.session!,
      'generate_upload_url',
      key,
      ip,
      { fileName, contentType, size }
    );

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
    });
  } catch (error) {
    console.error('Error generating product upload URL:', error);
    
    securityLogger.logEvent({
      type: 'suspicious_activity',
      userId: session.user.id,
      ip,
      path: '/api/admin/products/upload',
      method: 'POST',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'medium',
    });
    
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

