import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { Resend } from 'resend';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

interface EmailTestResult {
  success: boolean;
  checks: {
    resendApiKey: { valid: boolean; message: string };
    emailFrom: { valid: boolean; message: string; value?: string };
    adminEmail: { valid: boolean; message: string; value?: string };
  };
  testEmail?: {
    sent: boolean;
    messageId?: string;
    error?: string;
    errorDetails?: unknown;
  };
}

/**
 * POST /api/admin/test-email
 * Test email configuration and send a test email
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const result: EmailTestResult = {
      success: false,
      checks: {
        resendApiKey: { valid: false, message: '' },
        emailFrom: { valid: false, message: '' },
        adminEmail: { valid: false, message: '' },
      },
    };

    // Check 1: RESEND_API_KEY
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      result.checks.resendApiKey = {
        valid: false,
        message: 'RESEND_API_KEY environment variable is not set',
      };
    } else if (apiKey.length < 10) {
      result.checks.resendApiKey = {
        valid: false,
        message: 'RESEND_API_KEY appears to be invalid (too short)',
      };
    } else {
      result.checks.resendApiKey = {
        valid: true,
        message: `RESEND_API_KEY is set (${apiKey.substring(0, 7)}...)`,
      };
    }

    // Check 2: EMAIL_FROM
    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
      result.checks.emailFrom = {
        valid: false,
        message: 'EMAIL_FROM environment variable is not set',
        value: 'noreply@example.com (default fallback)',
      };
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidFormat = emailRegex.test(emailFrom);
      
      if (!isValidFormat) {
        result.checks.emailFrom = {
          valid: false,
          message: 'EMAIL_FROM has invalid email format',
          value: emailFrom,
        };
      } else if (emailFrom.includes('example.com')) {
        result.checks.emailFrom = {
          valid: false,
          message: 'EMAIL_FROM uses example.com - needs to be a real, verified domain in Resend',
          value: emailFrom,
        };
      } else {
        const domain = emailFrom.split('@')[1];
        result.checks.emailFrom = {
          valid: true,
          message: `EMAIL_FROM is set. Domain: ${domain} (must be verified in Resend dashboard)`,
          value: emailFrom,
        };
      }
    }

    // Check 3: ADMIN_EMAIL (optional)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      result.checks.adminEmail = {
        valid: true,
        message: 'ADMIN_EMAIL not set (will use EMAIL_FROM)',
        value: emailFrom || 'noreply@example.com',
      };
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidFormat = emailRegex.test(adminEmail);
      
      result.checks.adminEmail = {
        valid: isValidFormat,
        message: isValidFormat ? 'ADMIN_EMAIL is set' : 'ADMIN_EMAIL has invalid email format',
        value: adminEmail,
      };
    }

    // Get test email recipient from request body
    const body = await request.json();
    const testRecipient = body.recipient || authResult.session?.admin_email;

    if (!testRecipient) {
      return NextResponse.json(
        {
          ...result,
          message: 'Test email recipient not provided. Include "recipient" in request body.',
        },
        { status: 400 }
      );
    }

    // Only attempt to send test email if basic checks pass
    if (result.checks.resendApiKey.valid) {
      try {
        const resend = new Resend(apiKey);
        const fromEmail = emailFrom || 'noreply@example.com';

        const sendResult = await resend.emails.send({
          from: fromEmail,
          to: testRecipient,
          subject: 'Test Email from E-Commerce Platform',
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin: 0 0 10px 0;">✅ Email Configuration Test</h1>
    <p style="margin: 0;">This is a test email from your e-commerce platform.</p>
  </div>

  <div style="margin-bottom: 20px;">
    <h2 style="color: #2563eb; font-size: 18px;">Configuration Details</h2>
    <p><strong>From:</strong> ${fromEmail}</p>
    <p><strong>To:</strong> ${testRecipient}</p>
    <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
  </div>

  <div style="background-color: #dcfce7; padding: 15px; border-radius: 6px; border-left: 4px solid #22c55e;">
    <p style="margin: 0;"><strong>Success!</strong> Your Resend email integration is working correctly.</p>
  </div>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p><strong>Next Steps:</strong></p>
    <ul>
      <li>Verify that your sender domain (${fromEmail.split('@')[1]}) is verified in your Resend dashboard</li>
      <li>Test contact form submissions</li>
      <li>Test order confirmations</li>
      <li>Test appointment confirmations</li>
    </ul>
  </div>
</body>
</html>
          `,
          text: `
EMAIL CONFIGURATION TEST

This is a test email from your e-commerce platform.

Configuration Details:
- From: ${fromEmail}
- To: ${testRecipient}
- Sent at: ${new Date().toLocaleString()}

Success! Your Resend email integration is working correctly.

Next Steps:
- Verify that your sender domain (${fromEmail.split('@')[1]}) is verified in your Resend dashboard
- Test contact form submissions
- Test order confirmations
- Test appointment confirmations
          `,
        });

        result.testEmail = {
          sent: true,
          messageId: sendResult.data?.id,
        };
        result.success = true;

        securityLogger.logEvent({
          type: 'admin_action',
          userId: authResult.session?.admin_user_id,
          ip,
          path: '/api/admin/test-email',
          method: 'POST',
          details: {
            recipient: testRecipient,
            messageId: sendResult.data?.id,
            success: true,
          },
          severity: 'low',
        });

      } catch (emailError: unknown) {
        result.testEmail = {
          sent: false,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
          errorDetails: emailError,
        };

        // Log the full error for debugging
        securityLogger.logError('Test email failed', emailError, ip);

        // Parse common Resend errors
        if (emailError instanceof Error) {
          const errorMsg = emailError.message.toLowerCase();
          
          if (errorMsg.includes('domain') || errorMsg.includes('verify')) {
            result.testEmail.error = `Domain verification required: The sender domain (${(emailFrom || 'noreply@example.com').split('@')[1]}) needs to be verified in your Resend dashboard. Visit https://resend.com/domains to add and verify your domain.`;
          } else if (errorMsg.includes('api key') || errorMsg.includes('unauthorized')) {
            result.testEmail.error = 'Invalid RESEND_API_KEY. Please check your API key in the Resend dashboard.';
          } else if (errorMsg.includes('rate limit')) {
            result.testEmail.error = 'Rate limit exceeded. Please wait a moment and try again.';
          }
        }
      }
    } else {
      result.testEmail = {
        sent: false,
        error: 'Cannot send test email: RESEND_API_KEY validation failed',
      };
    }

    return NextResponse.json(result, { status: result.success ? 200 : 400 });

  } catch (error) {
    console.error('Error in test email endpoint:', error);
    securityLogger.logError('Test email endpoint error', error, ip);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test email configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

