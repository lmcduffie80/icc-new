import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { getClientIp, rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { uploadToS3, validateFileUpload, optimizeImage } from '@/lib/s3';

// Force Node.js runtime
export const runtime = 'nodejs';

// POST: Upload label image to S3
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting (stricter for uploads)
  const rateLimitResult = await checkRateLimit(request, rateLimiters.upload);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/label-templates/upload', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const productName = formData.get('product_name') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateFileUpload(
      file.name,
      file.type,
      file.size
    );

    if (!validation.valid) {
      securityLogger.logEvent({
        type: 'validation_failure',
        userId: authResult.session!.admin_user_id,
        ip,
        path: '/api/admin/label-templates/upload',
        method: 'POST',
        details: { 
          action: 'label_template_upload_validation_failed',
          errors: validation.errors
        },
        severity: 'low',
      });
      return NextResponse.json(
        { error: 'File validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Optimize image if it's an image file
    let finalBuffer: Buffer = buffer;
    if (file.type.startsWith('image/')) {
      try {
        const optimized = await optimizeImage(buffer);
        finalBuffer = Buffer.from(optimized);
      } catch (error) {
        console.error('Image optimization failed, using original:', error);
        // Continue with original buffer if optimization fails
      }
    }

    // Generate S3 path with product name
    const timestamp = Date.now();
    const sanitizedProductName = productName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const sanitizedFileName = file.name.replace(/[^a-z0-9.-]/gi, '-');
    const s3Path = `label-templates/${sanitizedProductName}/${timestamp}-${sanitizedFileName}`;

    // Upload to S3
    const uploadResult = await uploadToS3(finalBuffer, s3Path, file.type);

    // Check for upload error
    if ('error' in uploadResult) {
      securityLogger.logError('S3 upload failed for label template', new Error(uploadResult.error), ip);
      return NextResponse.json(
        { error: 'Failed to upload image to S3' },
        { status: 500 }
      );
    }

    securityLogger.logEvent({
      type: 'admin_action',
      userId: authResult.session!.admin_user_id,
      ip,
      path: '/api/admin/label-templates/upload',
      method: 'POST',
      details: { 
        action: 'label_template_image_uploaded',
        product_name: productName,
        filename: file.name,
        size: file.size,
        s3_key: uploadResult.key
      },
      severity: 'low',
    });

    // Build a permanent S3 URL (not a presigned URL) so it never expires.
    // The image proxy (/api/images/proxy) fetches from S3 using server-side AWS
    // credentials, so a permanent URL works fine for private buckets.
    const permanentUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${uploadResult.key}`;

    return NextResponse.json({
      url: permanentUrl,
      key: uploadResult.key,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (error) {
    securityLogger.logError('Failed to upload label template image', error, ip);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
