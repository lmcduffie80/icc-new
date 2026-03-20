import { NextRequest, NextResponse } from 'next/server';
import { getFileFromS3, getKeyFromUrl } from '@/lib/s3';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

/**
 * GET /api/images/proxy?url=<s3-url>
 * Proxy S3 files (images, PDFs, documents) through Next.js API to handle private bucket access
 * This allows Next.js to fetch files from private S3 buckets using server-side AWS credentials
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    // Ensure URL has protocol for parsing
    let urlToParse = imageUrl;
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      urlToParse = `https://${imageUrl}`;
    }
    
    // Extract S3 key from URL
    const s3Key = getKeyFromUrl(urlToParse);
    
    if (!s3Key) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/images/proxy',
        method: 'GET',
        details: {
          action: 'invalid_s3_url',
          url: imageUrl,
        },
        severity: 'low',
      });
      return NextResponse.json({ error: 'Invalid S3 URL' }, { status: 400 });
    }

    // Fetch file from S3 using AWS credentials
    const file = await getFileFromS3(s3Key);

    if (!file) {
      // Check if it's a permissions issue by looking at the error logs
      // The getFileFromS3 function logs AccessDenied errors
      return NextResponse.json(
        { 
          error: 'File not found or access denied',
          message: 'The file may not exist or AWS credentials may not have permission to access it. Check S3 bucket permissions and IAM policy.',
        },
        { status: 403 }
      );
    }

    // Determine if this is a PDF that should be viewed inline
    const isPDF = file.contentType === 'application/pdf';
    const headers: HeadersInit = {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    
    // For PDFs, use inline disposition so they can be viewed in browser
    if (isPDF) {
      headers['Content-Disposition'] = 'inline';
    }
    
    // Return file with proper headers (works for images, PDFs, and other documents)
    return new NextResponse(new Uint8Array(file.buffer), {
      headers,
    });
  } catch (error) {
    securityLogger.logError('Failed to proxy file', error, ip);

    // Provide more specific error messages
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
      return NextResponse.json(
        {
          error: 'Access denied',
          message: 'AWS credentials do not have permission to access this S3 file. Please check IAM permissions for s3:GetObject on the bucket.',
          details: process.env.NODE_ENV === 'development' ? {
            bucket: process.env.AWS_S3_BUCKET_NAME,
            key: getKeyFromUrl(imageUrl || ''),
          } : undefined,
          },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to fetch file',
        message: error instanceof Error ? error.message : 'An error occurred while fetching the file from S3',
      },
      { status: 500 }
    );
  }
}

