import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import {
  createOrGetStripeCustomer,
  listPaymentMethods,
  detachPaymentMethod,
  createSetupIntent,
} from '@/lib/stripe';
import { query, queryOne } from '@/lib/db';

// Payment settings interface
interface PaymentSettings {
  stripe_enabled: boolean;
  min_order_amount: number;
  max_order_amount: number;
  allow_saved_cards: boolean;
  send_receipt_emails: boolean;
}

// Default payment settings
const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  stripe_enabled: true,
  min_order_amount: 10,
  max_order_amount: 10000,
  allow_saved_cards: true,
  send_receipt_emails: true,
};

/**
 * Get payment settings with defaults for missing fields
 */
function getPaymentSettings(raw: unknown): PaymentSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PAYMENT_SETTINGS;
  return { ...DEFAULT_PAYMENT_SETTINGS, ...(raw as Partial<PaymentSettings>) };
}

/**
 * GET /api/payment/methods
 * List all saved payment methods for the authenticated user
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - relaxed (60 req/min for authenticated reads)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/payment/methods', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Authentication required
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch payment settings
    const paymentSettingsResult = await queryOne<{ value: unknown }>(
      'SELECT value FROM site_settings WHERE key = $1',
      ['payment']
    );
    const paymentSettings = getPaymentSettings(paymentSettingsResult?.value);

    // Get Stripe customer ID
    const customerId = await createOrGetStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    // Get saved payment methods
    const paymentMethods = await listPaymentMethods(customerId, session.user.id);

    return NextResponse.json({
      paymentMethods: paymentMethods.map(pm => ({
        id: pm.id,
        paymentMethodId: pm.stripe_payment_method_id,
        brand: pm.card_brand,
        last4: pm.last4,
        expMonth: pm.exp_month,
        expYear: pm.exp_year,
        isDefault: pm.is_default,
      })),
      // Let the frontend know if saving new cards is allowed
      allowSavedCards: paymentSettings.allow_saved_cards,
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    securityLogger.logError('Failed to fetch payment methods', error, ip);
    return NextResponse.json(
      { error: 'Failed to fetch payment methods' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payment/methods
 * Create a setup intent for adding a new payment method
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - moderate (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/payment/methods', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Authentication required
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch payment settings
    const paymentSettingsResult = await queryOne<{ value: unknown }>(
      'SELECT value FROM site_settings WHERE key = $1',
      ['payment']
    );
    const paymentSettings = getPaymentSettings(paymentSettingsResult?.value);

    // Check if saving cards is allowed
    if (!paymentSettings.allow_saved_cards) {
      return NextResponse.json(
        { error: 'Saving payment methods is currently disabled' },
        { status: 403 }
      );
    }

    // Get or create Stripe customer
    const customerId = await createOrGetStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    );

    // Create setup intent
    const { setupIntent, clientSecret } = await createSetupIntent(customerId);

    return NextResponse.json({
      clientSecret,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    securityLogger.logError('Failed to create setup intent', error, ip);
    return NextResponse.json(
      { error: 'Failed to create setup intent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/payment/methods
 * Remove a payment method
 */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  
  try {
    // Rate limiting - moderate (5 req/min)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/payment/methods', 'DELETE');
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
    const { paymentMethodId } = body;

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'Payment method ID is required' },
        { status: 400 }
      );
    }

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

    // Detach payment method
    await detachPaymentMethod(paymentMethodId, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing payment method:', error);
    securityLogger.logError('Failed to remove payment method', error, ip);
    
    if (error instanceof Error && error.message.includes('default')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to remove payment method' },
      { status: 500 }
    );
  }
}

