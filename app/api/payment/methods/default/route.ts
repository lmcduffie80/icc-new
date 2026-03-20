import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { createOrGetStripeCustomer, setDefaultPaymentMethod } from '@/lib/stripe';
import { query } from '@/lib/db';
import { paymentMethodSetDefaultSchema } from '@/lib/validation';

/**
 * POST /api/payment/methods/default
 * Set a payment method as the default
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - moderate (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/payment/methods/default', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Authentication required
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = paymentMethodSetDefaultSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { paymentMethodId } = validation.data;

    // Verify payment method belongs to user
    const existingMethod = await query(
      `SELECT * FROM payment_methods 
       WHERE user_id = $1 AND stripe_payment_method_id = $2`,
      [session.user.id, paymentMethodId]
    );

    if (existingMethod.length === 0) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      );
    }

    // Get Stripe customer ID
    const customerId = await createOrGetStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    // Set as default
    await setDefaultPaymentMethod(paymentMethodId, customerId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    securityLogger.logError('Failed to set default payment method', error, ip);
    return NextResponse.json(
      { error: 'Failed to set default payment method' },
      { status: 500 }
    );
  }
}

