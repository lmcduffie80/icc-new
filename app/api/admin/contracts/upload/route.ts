import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { generatePresignedUploadUrl } from '@/lib/s3';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { contractDocumentUploadSchema } from '@/lib/validation';

// POST: Generate presigned URL for contract PDF upload
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

  // Check for admins.view permission (same as Partners section)
  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/upload',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden - Missing admins.view permission' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { contentType, fileName, size, supplierId } = body;

    // Sanitize filename first before validation
    const sanitizedFileName = fileName
      ? fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : 'contract.pdf';

    // Validate input with Zod (using sanitized filename)
    const validationResult = contractDocumentUploadSchema.safeParse({
      contentType,
      fileName: sanitizedFileName,
      size,
      supplierId,
    });

    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/contracts/upload',
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

    // Generate unique key with supplier ID
    const timestamp = Date.now();
    const extension = sanitizedFileName.split('.').pop() || 'pdf';
    const key = `supplier-contracts/${supplierId}/${timestamp}-${sanitizedFileName.replace(/\.[^/.]+$/, '')}.${extension}`;

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
      'generate_contract_upload_url',
      key,
      ip,
      { fileName, contentType, size, supplierId }
    );

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
    });
  } catch (error) {
    console.error('Error generating contract upload URL:', error);
    
    securityLogger.logEvent({
      type: 'suspicious_activity',
      userId: session.user.id,
      ip,
      path: '/api/admin/contracts/upload',
      method: 'POST',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'medium',
    });
    
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
