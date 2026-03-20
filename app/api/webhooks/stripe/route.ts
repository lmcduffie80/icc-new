import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { verifyWebhookSignature } from '@/lib/stripe';
import { query, queryOne } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';

// Disable body parsing for webhook
export const runtime = 'nodejs';

interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  processed_at: string | null;
}

/**
 * Check if webhook event has already been processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await queryOne<WebhookEvent>(
    `SELECT * FROM stripe_webhook_events WHERE event_id = $1`,
    [eventId]
  );
  return !!existing;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(
  eventId: string,
  eventType: string,
  status: 'processed' | 'failed',
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO stripe_webhook_events (event_id, event_type, status, error_message, processed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (event_id) DO UPDATE 
     SET status = $3, error_message = $4, processed_at = NOW()`,
    [eventId, eventType, status, errorMessage || null]
  );
}

/**
 * Handle payment_intent.succeeded event
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  // Check if order exists with this payment intent
  const orders = await query(
    `SELECT * FROM orders WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  if (orders.length === 0) {
    // Order might not be created yet, log for monitoring
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'webhook',
      path: '/api/webhooks/stripe',
      method: 'POST',
      details: {
        message: 'Payment succeeded but no order found',
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
      },
      severity: 'medium',
    });
    return;
  }

  // Update order payment status
  await query(
    `UPDATE orders SET payment_status = 'succeeded', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  securityLogger.logEvent({
    type: 'suspicious_activity',
    ip: 'webhook',
    path: '/api/webhooks/stripe',
    method: 'POST',
    details: {
      message: 'Payment intent succeeded - order updated',
      paymentIntentId: paymentIntent.id,
      orderCount: orders.length,
    },
    severity: 'low',
  });
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  // Update order payment status
  await query(
    `UPDATE orders SET payment_status = 'failed', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  securityLogger.logEvent({
    type: 'suspicious_activity',
    ip: 'webhook',
    path: '/api/webhooks/stripe',
    method: 'POST',
    details: {
      message: 'Payment intent failed',
      paymentIntentId: paymentIntent.id,
      lastPaymentError: paymentIntent.last_payment_error?.message,
    },
    severity: 'medium',
  });
}

/**
 * Handle payment_method.attached event
 */
async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  // Check if it's already in our database
  const existing = await query(
    `SELECT * FROM payment_methods WHERE stripe_payment_method_id = $1`,
    [paymentMethod.id]
  );

  if (existing.length > 0) {
    // Already exists, webhook came after our API call
    return;
  }

  // This is unusual - payment method attached outside our flow
  securityLogger.logEvent({
    type: 'suspicious_activity',
    ip: 'webhook',
    path: '/api/webhooks/stripe',
    method: 'POST',
    details: {
      message: 'Payment method attached outside application flow',
      paymentMethodId: paymentMethod.id,
      customerId: paymentMethod.customer,
    },
    severity: 'low',
  });
}

/**
 * Handle payment_method.detached event
 */
async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  // Remove from database if exists
  await query(
    `DELETE FROM payment_methods WHERE stripe_payment_method_id = $1`,
    [paymentMethod.id]
  );

  securityLogger.logEvent({
    type: 'suspicious_activity',
    ip: 'webhook',
    path: '/api/webhooks/stripe',
    method: 'POST',
    details: {
      message: 'Payment method detached',
      paymentMethodId: paymentMethod.id,
    },
    severity: 'low',
  });
}

/**
 * Handle customer.updated event
 */
async function handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
  // Sync customer metadata if needed
  if (customer.metadata?.userId) {
    await query(
      `UPDATE stripe_customers SET updated_at = NOW()
       WHERE stripe_customer_id = $1 AND user_id = $2`,
      [customer.id, customer.metadata.userId]
    );
  }
}

/**
 * Handle charge.refunded event
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.payment_intent) {
    return;
  }

  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent.id;

  // Update order payment status
  const isFullRefund = charge.amount_refunded === charge.amount;
  const status = isFullRefund ? 'refunded' : 'partially_refunded';

  await query(
    `UPDATE orders SET payment_status = $1, updated_at = NOW()
     WHERE stripe_payment_intent_id = $2`,
    [status, paymentIntentId]
  );

  securityLogger.logEvent({
    type: 'suspicious_activity',
    ip: 'webhook',
    path: '/api/webhooks/stripe',
    method: 'POST',
    details: {
      message: `Charge ${status}`,
      chargeId: charge.id,
      paymentIntentId,
      amountRefunded: charge.amount_refunded,
      amountTotal: charge.amount,
    },
    severity: 'medium',
  });
}

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body and signature
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip: 'webhook',
        path: '/api/webhooks/stripe',
        method: 'POST',
        details: {
          message: 'Webhook received without signature',
        },
        severity: 'high',
      });
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(body, signature);
    } catch {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Check if event already processed (idempotency)
    if (await isEventProcessed(event.id)) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip: 'webhook',
        path: '/api/webhooks/stripe',
        method: 'POST',
        details: {
          message: 'Webhook event already processed (duplicate)',
          eventId: event.id,
          eventType: event.type,
        },
        severity: 'low',
      });
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Log webhook receipt
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'webhook',
      path: '/api/webhooks/stripe',
      method: 'POST',
      details: {
        message: 'Webhook event received',
        eventId: event.id,
        eventType: event.type,
      },
      severity: 'low',
    });

    // Process event based on type
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_method.attached':
          await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
          break;

        case 'payment_method.detached':
          await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
          break;

        case 'customer.updated':
          await handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          // Log unhandled event type
          securityLogger.logEvent({
            type: 'suspicious_activity',
            ip: 'webhook',
            path: '/api/webhooks/stripe',
            method: 'POST',
            details: {
              message: 'Unhandled webhook event type',
              eventId: event.id,
              eventType: event.type,
            },
            severity: 'low',
          });
      }

      // Mark event as processed
      await markEventProcessed(event.id, event.type, 'processed');

      return NextResponse.json({ received: true });
    } catch (error) {
      // Mark event as failed but return 200 to prevent Stripe retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markEventProcessed(event.id, event.type, 'failed', errorMessage);

      securityLogger.logError(
        'Webhook event processing failed',
        error,
        'webhook'
      );

      // Still return 200 to acknowledge receipt
      return NextResponse.json({ 
        received: true, 
        error: 'Processing failed but acknowledged',
      });
    }
  } catch (err) {
    securityLogger.logError(
      'Webhook endpoint error',
      err,
      'webhook'
    );
    
    // Return 500 for infrastructure errors (will cause Stripe to retry)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

