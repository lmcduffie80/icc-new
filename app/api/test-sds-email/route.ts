import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { Resend } from 'resend';
import { getFileFromS3, getKeyFromUrl } from '@/lib/s3';

/**
 * POST /api/test-sds-email
 * Test endpoint to verify SDS document fetching and email sending
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

  try {
    const body = await request.json();
    const { sdsUrl, email } = body;

    if (!sdsUrl || !email) {
      return NextResponse.json(
        { error: 'sdsUrl and email are required' },
        { status: 400 }
      );
    }

    console.log('🧪 TEST: Starting SDS email test');
    console.log('🧪 TEST: SDS URL:', sdsUrl);
    console.log('🧪 TEST: Email:', email);

    let fileBuffer: Buffer;
    let contentType = 'application/pdf';
    let filename = 'test-sds.pdf';

    // Try to fetch from S3 first
    const s3Key = getKeyFromUrl(sdsUrl);
    console.log('🧪 TEST: Extracted S3 key:', s3Key);

    if (s3Key) {
      console.log('🧪 TEST: Attempting to fetch from S3...');
      const s3File = await getFileFromS3(s3Key);
      if (s3File) {
        fileBuffer = s3File.buffer;
        contentType = s3File.contentType || 'application/pdf';
        filename = s3Key.split('/').pop() || 'sds-document.pdf';
        console.log('🧪 TEST: ✓ Successfully fetched from S3');
        console.log('🧪 TEST: File size:', fileBuffer.length, 'bytes');
        console.log('🧪 TEST: Content type:', contentType);
        console.log('🧪 TEST: Filename:', filename);
      } else {
        console.log('🧪 TEST: S3 fetch failed, trying external URL...');
        // Fallback to external URL
        const response = await fetch(sdsUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        });
        if (!response.ok) {
          return NextResponse.json(
            { error: `Failed to fetch SDS: ${response.status} ${response.statusText}` },
            { status: 500 }
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        contentType = response.headers.get('content-type') || 'application/pdf';
        filename = sdsUrl.split('/').pop() || 'sds-document.pdf';
        console.log('🧪 TEST: ✓ Successfully fetched from external URL');
        console.log('🧪 TEST: File size:', fileBuffer.length, 'bytes');
      }
    } else {
      console.log('🧪 TEST: Not an S3 URL, fetching as external URL...');
      const response = await fetch(sdsUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });
      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch SDS: ${response.status} ${response.statusText}` },
          { status: 500 }
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      contentType = response.headers.get('content-type') || 'application/pdf';
      filename = sdsUrl.split('/').pop() || 'sds-document.pdf';
      console.log('🧪 TEST: ✓ Successfully fetched from external URL');
      console.log('🧪 TEST: File size:', fileBuffer.length, 'bytes');
    }

    // Validate buffer
    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Fetched file is empty' },
        { status: 500 }
      );
    }

    // Validate it's a PDF
    const pdfHeader = fileBuffer.toString('ascii', 0, 4);
    const isPDF = pdfHeader === '%PDF';
    console.log('🧪 TEST: PDF header:', pdfHeader, 'isPDF:', isPDF);

    if (!isPDF) {
      console.warn('🧪 TEST: ⚠️ File does not appear to be a PDF');
    }

    // Sanitize filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = `${filename}.pdf`;
    }

    console.log('🧪 TEST: Sending email via Resend...');
    console.log('🧪 TEST: Attachment filename:', filename);
    console.log('🧪 TEST: Attachment size:', fileBuffer.length, 'bytes');

    // Send email with SDS attachment
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email.trim(),
      subject: 'Test SDS Document Email',
      html: `
        <h1>Test SDS Document</h1>
        <p>This is a test email to verify SDS document attachment.</p>
        <p>File: ${filename}</p>
        <p>Size: ${fileBuffer.length} bytes</p>
        <p>Content Type: ${contentType}</p>
        <p>Is PDF: ${isPDF ? 'Yes' : 'No'}</p>
      `,
      attachments: [
        {
          filename,
          content: fileBuffer.toString('base64'),
        },
      ],
    });

    console.log('🧪 TEST: Resend API response:', {
      success: !result.error,
      messageId: result.data?.id,
      error: result.error,
    });

    if (result.error) {
      return NextResponse.json(
        {
          error: 'Failed to send email',
          resendError: result.error,
          details: {
            filename,
            fileSize: fileBuffer.length,
            contentType,
            isPDF,
            pdfHeader,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.data?.id,
      details: {
        filename,
        fileSize: fileBuffer.length,
        contentType,
        isPDF,
        pdfHeader,
        s3Key: s3Key || 'N/A (external URL)',
      },
    });
  } catch (error) {
    console.error('🧪 TEST: Error:', error);
    return NextResponse.json(
      {
        error: 'Test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      },
      { status: 500 }
    );
  }
}

