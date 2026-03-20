import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { stripe, createOrGetStripeCustomer, attachPaymentMethod } from '@/lib/stripe';

/**
 * POST /api/payment/methods/confirm
 * Confirm a setup intent and attach the payment method
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - moderate (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/payment/methods/confirm', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Authentication required
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { setupIntentId, setAsDefault } = body;

    if (!setupIntentId) {
      return NextResponse.json(
        { error: 'Setup intent ID is required' },
        { status: 400 }
      );
    }

    // Retrieve setup intent from Stripe
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.status !== 'succeeded') {
      return NextResponse.json(
        { 
          error: 'Setup intent not completed',
          message: 'Payment method setup was not successful',
        },
        { status: 400 }
      );
    }

    if (!setupIntent.payment_method) {
      return NextResponse.json(
        { error: 'No payment method found' },
        { status: 400 }
      );
    }

    // Get payment method ID
    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method.id;

    // Get Stripe customer ID
    const customerId = await createOrGetStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    // Attach payment method to customer and save to DB
    await attachPaymentMethod(
      paymentMethodId,
      customerId,
      session.user.id,
      setAsDefault || false
    );

    return NextResponse.json({ 
      success: true,
      paymentMethodId,
    });
  } catch (error) {
    console.error('Error confirming setup intent:', error);
    securityLogger.logError('Failed to confirm setup intent', error, ip);
    return NextResponse.json(
      { error: 'Failed to confirm payment method' },
      { status: 500 }
    );
  }
}

