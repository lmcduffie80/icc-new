import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

/**
 * Test endpoint to verify Resend API is working
 * Tests: Resend email sending without attachment
 */
export async function GET() {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'RESEND_API_KEY not configured',
        apiKeyExists: false,
      }, { status: 500 });
    }

    // Initialize Resend client
    const resend = new Resend(RESEND_API_KEY);

    // Test 1: Simple email send (without attachment)
    console.log('🧪 TEST: Testing Resend API with simple email...');
    
    // Use a test email - in a real scenario, you'd provide this via request body
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    
    const emailResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: testEmail,
      subject: 'Resend API Test',
      html: `
        <h2>Resend API Test</h2>
        <p>This is a test email from Resend API.</p>
        <p>If you receive this email, Resend API is working correctly!</p>
        <p>Generated at: ${new Date().toISOString()}</p>
      `,
    });

    if (emailResult.error) {
      return NextResponse.json({
        success: false,
        error: 'Resend API error',
        details: {
          name: emailResult.error.name,
          message: emailResult.error.message,
          statusCode: emailResult.error.statusCode,
        },
        apiKeyExists: true,
        apiKeyLength: RESEND_API_KEY.length,
        fromEmail: FROM_EMAIL,
        toEmail: testEmail,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Resend API test successful',
      details: {
        messageId: emailResult.data?.id,
        from: FROM_EMAIL,
        to: testEmail,
        apiKeyExists: true,
        apiKeyLength: RESEND_API_KEY.length,
      },
    });
  } catch (error) {
    console.error('🧪 TEST: Error in Resend test:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: {
        message: error instanceof Error ? error.message : String(error),
        type: error instanceof Error ? error.constructor.name : typeof error,
      },
    }, { status: 500 });
  }
}

