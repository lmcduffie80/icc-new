import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { contactFormSchema } from '@/lib/validation';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { sendContactNotification, sendContactAutoReply } from '@/lib/email';
import { verifyRecaptcha, SCORE_THRESHOLD } from '@/lib/recaptcha';

interface ContactSubmission {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

// POST: Submit a contact form
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - critical route (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.critical);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/contact', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const body = await request.json();

    // Validate input with Zod
    const validationResult = contactFormSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/contact',
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

    const { name, email, phone, subject, message, recaptchaToken, website, form_loaded_at } = validationResult.data;

    // Honeypot check -- bots auto-fill hidden fields; real users never see them.
    // Return a fake success so the bot thinks it worked.
    if (website) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/contact',
        method: 'POST',
        details: { reason: 'honeypot_triggered', email },
        severity: 'high',
      });
      return NextResponse.json({
        success: true,
        submission: {
          id: 'ok',
          message: 'Your message has been sent successfully. We will get back to you shortly.',
        },
      });
    }

    // Time-based bot guard — bots submit forms in milliseconds; require at least 4 seconds
    const MIN_ELAPSED_MS = 4000;
    if (form_loaded_at) {
      const elapsed = Date.now() - parseInt(form_loaded_at, 10);
      if (elapsed < MIN_ELAPSED_MS) {
        securityLogger.logEvent({
          type: 'suspicious_activity',
          ip,
          path: '/api/contact',
          method: 'POST',
          details: { reason: 'too_fast_submission', elapsed_ms: elapsed, email },
          severity: 'high',
        });
        return NextResponse.json({
          success: true,
          submission: {
            id: 'ok',
            message: 'Your message has been sent successfully. We will get back to you shortly.',
          },
        });
      }
    }

    // reCAPTCHA v3 verification
    const recaptchaResult = await verifyRecaptcha(recaptchaToken || '', ip);
    if (!recaptchaResult.success || recaptchaResult.score < SCORE_THRESHOLD) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/contact',
        method: 'POST',
        details: {
          reason: 'recaptcha_failed',
          score: recaptchaResult.score,
          email,
        },
        severity: 'high',
      });
      return NextResponse.json(
        { error: 'Verification failed. Please try again.' },
        { status: 403 }
      );
    }

    // Try to get the current user session (optional - form can be submitted by guests)
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      userId = session?.user?.id || null;
    } catch {
      // User is not authenticated, which is fine for contact forms
    }

    // Create the contact submission
    const submission = await queryOne<ContactSubmission>(
      `INSERT INTO contact_submissions (user_id, name, email, phone, subject, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'new')
       RETURNING *`,
      [userId, name, email, phone || null, subject, message]
    );

    if (!submission) {
      throw new Error('Failed to create contact submission');
    }

    // Log successful submission
    securityLogger.logEvent({
      type: 'admin_action',
      userId: userId || undefined,
      ip,
      path: '/api/contact',
      method: 'POST',
      details: { submissionId: submission.id, email },
      severity: 'low',
    });

    // Send notification emails (non-blocking - log errors but don't fail submission)
    const emailsSent = { notification: false, autoReply: false };
    try {
      // Send notification to admin
      const notificationResult = await sendContactNotification({
        submissionId: submission.id,
        name,
        email,
        phone: phone || undefined,
        subject,
        message,
        submittedAt: submission.created_at,
        userId: userId || undefined,
        ip,
      });
      emailsSent.notification = notificationResult.success;

      // Send auto-reply to customer
      const autoReplyResult = await sendContactAutoReply(name, email, ip);
      emailsSent.autoReply = autoReplyResult.success;

      // Log detailed results if any email failed
      if (!notificationResult.success || !autoReplyResult.success) {
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/contact',
          method: 'POST',
          details: {
            submissionId: submission.id,
            emailResults: {
              notification: {
                success: notificationResult.success,
                error: notificationResult.error,
              },
              autoReply: {
                success: autoReplyResult.success,
                error: autoReplyResult.error,
              },
            },
          },
          severity: 'medium',
        });

        console.warn('Contact form emails partially failed:', {
          notification: notificationResult.success ? 'sent' : notificationResult.error,
          autoReply: autoReplyResult.success ? 'sent' : autoReplyResult.error,
        });
      }
    } catch (emailError) {
      // Log email error but don't fail the submission
      securityLogger.logEvent({
        type: 'admin_action',
        ip,
        path: '/api/contact',
        method: 'POST',
        details: {
          submissionId: submission.id,
          emailError: emailError instanceof Error ? emailError.message : 'Unknown error',
          emailsSent,
        },
        severity: 'high',
      });
      console.error('Failed to send contact form emails:', emailError);
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        message: 'Your message has been sent successfully. We will get back to you shortly.',
      },
    });
  } catch (error) {
    console.error('Error creating contact submission:', error);
    
    // Log error without exposing details to client
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip,
      path: '/api/contact',
      method: 'POST',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      severity: 'medium',
    });
    
    return NextResponse.json({ error: 'Failed to submit contact form' }, { status: 500 });
  }
}

